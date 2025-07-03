import { Instantiator } from "SpectaclesSyncKit.lspkg/Components/Instantiator";
import { SessionController } from "SpectaclesSyncKit.lspkg/Core/SessionController";
import { LineObjectController } from "./LineObjectController";
import { Line3D } from "./Line3D";
import { HandObjectManager } from "../Hands/HandObjectManager";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";

@component
export class LineObjectManager extends BaseScriptComponent {

    @input
    textLog: Text

    @input
    instantiator: Instantiator

    @input
    lineStartPrefab: ObjectPrefab

    @input
    lineMidPointPrefab: ObjectPrefab

    @input
    handObjectManager: HandObjectManager

    @input
    line3DComponent: Line3D

    @input
    line3DComponentSecond: Line3D

    @input
    testingMode: boolean = false

    @input
    lineStartSceneObject: SceneObject

    @input
    lineEndSceneObject: SceneObject

    @input
    lineMidSceneObject: SceneObject

    @input
    lineRemoteStartSceneObject: SceneObject

    private myLineStart: LineObjectController;
    private myLineMidPoint: SceneObject | null = null;
    private allLineObjects: LineObjectController[] = [];
    private updateEventBound: boolean = false;
    private frameCounter: number = 0;
    private isLocalKameHameHaReady: boolean = false;
    private isRemoteKameHameHaReady: boolean = false;
    private areLinesEnabled: boolean = false;

    // Callbacks for external systems
    private onLineObjectsReadyCallbacks: ((lineStart: LineObjectController, lineEnd: LineObjectController) => void)[] = [];

    subscribe(lineObject: LineObjectController) {
        this.allLineObjects.push(lineObject);
        
        print(`🔍 DEBUG: Subscribed to line object - Type: ${lineObject.getLineType()}, IsLocal: ${lineObject.isLocalLine()}`);
        
        if (lineObject.isLocalLine()) {
            // For local objects, we only care about the start object (represents our hands center)
            if (lineObject.getLineType() === "start") {
                this.myLineStart = lineObject;
                print("📝 Subscribed to local line start object (hands position broadcaster)");
                this.textLog.text = "📝 Subscribed to local line start object";
                
                // Notify that we're ready to broadcast our position
                print("⚡ Local line broadcaster is ready!");
                this.textLog.text = "⚡ Local line broadcaster is ready!";
                this.notifyLineObjectsReady(this.myLineStart, null);
            }
            // We ignore local end objects since we don't use them anymore
        } else {
            // This is a remote line object
            const pos = lineObject.getWorldPosition();
            print(`📡 Remote line object detected - Type: ${lineObject.getLineType()}, Position: (${pos.x.toFixed(4)}, ${pos.y.toFixed(4)}, ${pos.z.toFixed(4)})`);
            this.textLog.text = `📡 Remote ${lineObject.getLineType()} detected`;
        }
        
        // Bind update event only once
        if (!this.updateEventBound) {
            this.createEvent("UpdateEvent").bind(() => this.onUpdate());
            this.updateEventBound = true;
        }
    }

    instantiateLineObjects() {
        print("Instantiating line start object for " + SessionController.getInstance().getLocalUserName());
        
        // Only instantiate line start object (represents our hands center position)
        this.instantiator.instantiate(this.lineStartPrefab, {
            onSuccess: (networkRoot) => {
                print("✅ Line start object (hands broadcaster) instantiated successfully");
                this.textLog.text = "✅ Line start object instantiated successfully";
                // Set testing mode on the line controller
                const lineController = networkRoot.sceneObject.getComponent(LineObjectController.getTypeName()) as LineObjectController;
                if (lineController) {
                    lineController.testingMode = this.testingMode;
                }
            },
            onError: (error) => {
                print("❌ Error instantiating line start object: " + error);
                this.textLog.text = "❌ Error instantiating line start object: " + error;
            }
        });
        
        // We no longer need the line end object since the line connects local to remote players
        
        // Instantiate the midpoint object
        this.instantiateLineMidPoint();
    }
    private instantiateLineMidPoint() {
        if (!this.lineMidPointPrefab) {
            print("⚠️ No LineMidPoint prefab assigned, skipping midpoint instantiation");
            return;
        }

        print("Instantiating line midpoint object for " + SessionController.getInstance().getLocalUserName());
        
        this.instantiator.instantiate(this.lineMidPointPrefab, {
            onSuccess: (networkRoot) => {
                print("✅ Line midpoint object instantiated successfully");
                this.textLog.text = "✅ Line midpoint object instantiated successfully";
                this.myLineMidPoint = networkRoot.sceneObject;
                
                // Position it at the current line center
                const lineCenter = this.getLineCenter();
                if (lineCenter) {
                    this.myLineMidPoint.getTransform().setWorldPosition(lineCenter);
                }
            },
            onError: (error) => {
                print("❌ Error instantiating line midpoint object: " + error);
                this.textLog.text = "❌ Error instantiating line midpoint object: " + error;
            }
        });
    }

    onUpdate() {
        this.frameCounter++;
        
        // Update line object positions based on hand positions
        this.updateLineObjectPositions();
        
        // Only update Line3D and midpoint if lines are enabled
        if (this.areLinesEnabled) {
            // Update the scene objects that the Line3D references
            this.updateLine3D();
            
            // Update the midpoint position
            this.updateLineMidPoint();
        }
        
        // Debug: Log session status periodically (every 60 frames)
        if (this.frameCounter % 60 === 0) {
            this.debugSessionStatus();
        }
    }
    
    private debugSessionStatus() {
        const sessionController = SessionController.getInstance();
        if (sessionController) {
            print(`🌐 Session Status - Local User: ${sessionController.getLocalUserName()}, Total Objects: ${this.allLineObjects.length}, Remote Objects: ${this.getAllRemoteLineObjects().length}`);
            
            // Check if there are any users in the session
            try {
                // Try to get user count if the method exists
                const users = (sessionController as any).getUsers ? (sessionController as any).getUsers() : null;
                if (users) {
                    print(`👥 Users in session: ${users.length}`);
                }
            } catch (e) {
                // Ignore if method doesn't exist
            }
        }
    }

    private updateLineObjectPositions() {
        // Only update LOCAL line objects to broadcast our hand positions to other players
        if (!this.myLineStart) {
            return;
        }

        if (this.testingMode) {
            // Testing mode: use fixed positions relative to camera
            const cameraTransform = WorldCameraFinderProvider.getInstance().getTransform();
            const cameraPos = cameraTransform.getWorldPosition();
            const forward = cameraTransform.forward.uniformScale(30); // 30cm forward
            
            const testStartPos = cameraPos.add(forward);
            
            this.myLineStart.setPosition(testStartPos);
            
            print(`🧪 Testing Mode: Broadcasting local hands position at (${testStartPos.x.toFixed(2)}, ${testStartPos.y.toFixed(2)}, ${testStartPos.z.toFixed(2)})`);
            return;
        }

        // Normal mode: use hand positions
        if (!this.handObjectManager) {
            return;
        }

        // Check if hands are available
        if (!this.handObjectManager.areMyHandsReady()) {
            return;
        }

        // Get hand positions
        const handsCenter = this.handObjectManager.getMyHandsCenter();
        if (!handsCenter) {
            return;
        }

        // Only update the START line object with our hands center position
        // This broadcasts our hands position to other players
        this.myLineStart.setPosition(handsCenter);
        
        // We don't need to update myLineEnd anymore since the line goes from local to remote
        // The end position will be determined by the remote player's start position
    }

    private updateLine3D() {
        // Update the scene object positions for both line beams
        if (!this.lineStartSceneObject || !this.lineMidSceneObject || !this.lineRemoteStartSceneObject) {
            return;
        }

        // Get local player's hands position
        let localHandsCenter: vec3 | null = null;
        if (this.testingMode) {
            // In testing mode, use camera position
            const cameraTransform = WorldCameraFinderProvider.getInstance().getTransform();
            const cameraPos = cameraTransform.getWorldPosition();
            const forward = cameraTransform.forward.uniformScale(30);
            localHandsCenter = cameraPos.add(forward);
        } else if (this.handObjectManager) {
            localHandsCenter = this.handObjectManager.getMyHandsCenter();
        }

        // Get remote player's hands position
        let remoteHandsCenter: vec3 | null = null;
        const remoteLineObjects = this.getAllRemoteLineObjects();
        
        print(`🔍 DEBUG: Found ${remoteLineObjects.length} remote line objects`);
        remoteLineObjects.forEach((obj, index) => {
            const pos = obj.getWorldPosition();
            print(`🔍 DEBUG: Remote object ${index}: Type=${obj.getLineType()}, Pos=(${pos.x.toFixed(4)}, ${pos.y.toFixed(4)}, ${pos.z.toFixed(4)})`);
        });
        
        // Find remote start line object (which represents remote player's hands midpoint)
        const remoteStartLine = remoteLineObjects.find(obj => obj.getLineType() === "start");
        if (remoteStartLine) {
            remoteHandsCenter = remoteStartLine.getWorldPosition();
            print(`🔍 DEBUG: Found remote start line at (${remoteHandsCenter.x.toFixed(4)}, ${remoteHandsCenter.y.toFixed(4)}, ${remoteHandsCenter.z.toFixed(4)})`);
        } else {
            print(`🔍 DEBUG: No remote start line found. Remote objects types: ${remoteLineObjects.map(obj => obj.getLineType()).join(', ')}`);
        }

        // Calculate midpoint position
        let midPointPosition: vec3 | null = null;
        if (localHandsCenter && remoteHandsCenter) {
            midPointPosition = new vec3(
                (localHandsCenter.x + remoteHandsCenter.x) / 2,
                (localHandsCenter.y + remoteHandsCenter.y) / 2,
                (localHandsCenter.z + remoteHandsCenter.z) / 2
            );
        } else if (localHandsCenter) {
            // If no remote player, position midpoint at a default forward position from local
            const defaultOffset = new vec3(0, 0, 50); // 50cm forward
            midPointPosition = localHandsCenter.add(defaultOffset);
        }

        // Update scene object positions
        if (localHandsCenter) {
            this.lineStartSceneObject.getTransform().setWorldPosition(localHandsCenter);
            print(`🔧 DEBUG: Local hands center at (${localHandsCenter.x.toFixed(2)}, ${localHandsCenter.y.toFixed(2)}, ${localHandsCenter.z.toFixed(2)})`);
        }

        if (midPointPosition) {
            this.lineMidSceneObject.getTransform().setWorldPosition(midPointPosition);
            print(`🔧 DEBUG: Midpoint at (${midPointPosition.x.toFixed(4)}, ${midPointPosition.y.toFixed(4)}, ${midPointPosition.z.toFixed(4)})`);
        }

        if (remoteHandsCenter) {
            this.lineRemoteStartSceneObject.getTransform().setWorldPosition(remoteHandsCenter);
            print(`🔧 DEBUG: Remote hands center at (${remoteHandsCenter.x.toFixed(4)}, ${remoteHandsCenter.y.toFixed(4)}, ${remoteHandsCenter.z.toFixed(4)})`);
        } else if (midPointPosition) {
            // If no remote player, position remote start at midpoint for visual consistency
            this.lineRemoteStartSceneObject.getTransform().setWorldPosition(midPointPosition);
            print(`🔧 DEBUG: No remote player, positioning remote start at midpoint`);
        }
        
        // Trigger both Line3D components to refresh
        // First beam: Local Start -> Midpoint
        if (this.line3DComponent) {
            this.line3DComponent.refreshPath();
        }
        
        // Second beam: Remote Start -> Midpoint  
        if (this.line3DComponentSecond) {
            this.line3DComponentSecond.refreshPath();
        }
    }

    private updateLineMidPoint() {
        // Update the midpoint position to stay at the center of the line
        if (!this.myLineMidPoint) {
            return;
        }

        const lineCenter = this.getLineCenter();
        if (lineCenter) {
            this.myLineMidPoint.getTransform().setWorldPosition(lineCenter);
            
            // Optional: Log midpoint position for debugging (every 60 frames)
            if (this.frameCounter % 60 === 0) {
                print(`🎯 LineMidPoint updated to position: (${lineCenter.x.toFixed(4)}, ${lineCenter.y.toFixed(4)}, ${lineCenter.z.toFixed(4)})`);
            }
        }
    }

    // Public methods for external systems
    getMyLineStart(): LineObjectController | null {
        return this.myLineStart || null;
    }

    getMyLineMidPoint(): SceneObject | null {
        return this.myLineMidPoint;
    }

    getLineCenter(): vec3 | null {
        if (!this.lineMidSceneObject) {
            return null;
        }
        return this.lineMidSceneObject.getTransform().getWorldPosition();
    }

    getLineStartPosition(): vec3 | null {
        if (!this.lineStartSceneObject) {
            return null;
        }
        return this.lineStartSceneObject.getTransform().getWorldPosition();
    }

    getLineMidPosition(): vec3 | null {
        if (!this.lineMidSceneObject) {
            return null;
        }
        return this.lineMidSceneObject.getTransform().getWorldPosition();
    }

    getLineRemoteStartPosition(): vec3 | null {
        if (!this.lineRemoteStartSceneObject) {
            return null;
        }
        return this.lineRemoteStartSceneObject.getTransform().getWorldPosition();
    }

    getLineEndPosition(): vec3 | null {
        // For backward compatibility - returns the midpoint position
        return this.getLineMidPosition();
    }

    areMyLineObjectsReady(): boolean {
        return !!this.myLineStart; // We only need the start object now
    }

    getAllRemoteLineObjects(): LineObjectController[] {
        return this.allLineObjects.filter(lineObj => !lineObj.isLocalLine());
    }

    subscribeToLineObjectsReady(callback: (lineStart: LineObjectController, lineEnd: LineObjectController) => void) {
        this.onLineObjectsReadyCallbacks.push(callback);
    }

    private notifyLineObjectsReady(lineStart: LineObjectController, lineEnd: LineObjectController) {
        this.onLineObjectsReadyCallbacks.forEach(callback => callback(lineStart, lineEnd));
    }

    private updateLineVisibility() {
        // For now, we'll enable lines when local player is ready
        // Later we can add remote player state checking
        const shouldEnableLines = this.isLocalKameHameHaReady; // && this.isRemoteKameHameHaReady;
        
        if (shouldEnableLines !== this.areLinesEnabled) {
            this.areLinesEnabled = shouldEnableLines;
            this.setLinesEnabled(shouldEnableLines);
            
            if (shouldEnableLines) {
                print("🔥 ACTIVATING KAME HAME HA BEAMS!");
                this.textLog.text = "🔥 ACTIVATING KAME HAME HA BEAMS!";
            } else {
                print("💤 Deactivating Kame Hame Ha beams");
                this.textLog.text = "💤 Deactivating Kame Hame Ha beams";
            }
        }
    }

    private setLinesEnabled(enabled: boolean) {
        // Enable/disable Line3D components
        if (this.line3DComponent) {
            this.line3DComponent.enabled = enabled;
        }
        if (this.line3DComponentSecond) {
            this.line3DComponentSecond.enabled = enabled;
        }
        
        // Enable/disable the midpoint object
        if (this.myLineMidPoint) {
            this.myLineMidPoint.enabled = enabled;
        }
        
        // Enable/disable scene objects used for line positioning
        if (this.lineStartSceneObject) {
            this.lineStartSceneObject.enabled = enabled;
        }
        if (this.lineMidSceneObject) {
            this.lineMidSceneObject.enabled = enabled;
        }
        if (this.lineRemoteStartSceneObject) {
            this.lineRemoteStartSceneObject.enabled = enabled;
        }
    }

    // Add method to check remote player KameHameHa status (for future use)
    private checkRemoteKameHameHaStatus() {
        // This would require network sync of KameHameHa ready state
        // For now, we'll assume remote is always ready when they're present
        const remoteObjects = this.getAllRemoteLineObjects();
        this.isRemoteKameHameHaReady = remoteObjects.length > 0;
        this.updateLineVisibility();
    }

    // Public method to manually set remote KameHameHa status (for testing or external control)
    setRemoteKameHameHaReady(isReady: boolean) {
        this.isRemoteKameHameHaReady = isReady;
        this.updateLineVisibility();
    }

    onStart() {
        SessionController.getInstance().notifyOnReady(() => {
            this.instantiator.notifyOnReady(() => {
                this.instantiateLineObjects();
                
                // Subscribe to HandObjectManager KameHameHa ready events
                if (this.handObjectManager) {
                    this.handObjectManager.subscribeToKameHameHaReady((isReady: boolean) => {
                        this.isLocalKameHameHaReady = isReady;
                        this.updateLineVisibility();
                    });
                }
            });
        });
    }

    onAwake() {
        this.createEvent("OnStartEvent").bind(() => this.onStart());
        
        // Initially disable all line components
        this.setLinesEnabled(false);
    }
}

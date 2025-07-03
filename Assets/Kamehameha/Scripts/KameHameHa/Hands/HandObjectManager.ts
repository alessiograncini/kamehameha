import { Instantiator } from "SpectaclesSyncKit.lspkg/Components/Instantiator";
import { SessionController } from "SpectaclesSyncKit.lspkg/Core/SessionController";
import { HandObjectController } from "./HandObjectController";

@component
export class HandObjectManager extends BaseScriptComponent {


    @input
    textDistanceText :Text
    @input
    textDistanceObject :SceneObject


    @input
    textLog :Text

    @input
    instantiator: Instantiator

    @input
    leftHandPrefab: ObjectPrefab

    @input
    rightHandPrefab: ObjectPrefab

    @input
    testingMode: boolean = false

    private myLeftHand: HandObjectController;
    private myRightHand: HandObjectController;
    private allHands: HandObjectController[] = [];

    // Callbacks for external systems (like KameHameHaController)
    private onHandsReadyCallbacks: ((leftHand: HandObjectController, rightHand: HandObjectController) => void)[] = [];
    private onKameHameHaReadyCallbacks: ((isReady: boolean) => void)[] = [];
    private lastKameHameHaState: boolean = false;

    subscribe(handObject: HandObjectController) {
        this.allHands.push(handObject);
        
        if (handObject.isLocalHand()) {
            if (handObject.getHandType() === "left") {
                this.myLeftHand = handObject;
                print("📝 Subscribed to local left hand");
                this.textLog.text = "📝 Subscribed to local left hand";
            } else if (handObject.getHandType() === "right") {
                this.myRightHand = handObject;
                print("📝 Subscribed to local right hand");
                this.textLog.text = "📝 Subscribed to local right hand";
            }

            // Check if both hands are ready
            if (this.myLeftHand && this.myRightHand) {
                print("🙌 Both local hands are ready!");
                this.textLog.text = "🙌 Both local hands are ready!";
                this.notifyHandsReady(this.myLeftHand, this.myRightHand);
            }
        }
        
        this.createEvent("UpdateEvent").bind(() => this.onUpdate());
    }

    instantiateHandObjects() {
        print("Instantiating hand objects for " + SessionController.getInstance().getLocalUserName());
        
        // Instantiate left hand
        this.instantiator.instantiate(this.leftHandPrefab, {
            onSuccess: (networkRoot) => {
                print("✅ Left hand instantiated successfully");
                this.textLog.text = "✅ Left hand instantiated successfully";
                // Set testing mode on the hand controller
                const handController = networkRoot.sceneObject.getComponent(HandObjectController.getTypeName()) as HandObjectController;
                if (handController) {
                    handController.testingMode = this.testingMode;
                }
            },
            onError: (error) => {
                print("❌ Error instantiating left hand: " + error);
                this.textLog.text = "❌ Error instantiating left hand: " + error;
            }
        });
        
        // Instantiate right hand
        this.instantiator.instantiate(this.rightHandPrefab, {
            onSuccess: (networkRoot) => {
                print("✅ Right hand instantiated successfully");
                this.textLog.text = "✅ Right hand instantiated successfully";
                // Set testing mode on the hand controller
                const handController = networkRoot.sceneObject.getComponent(HandObjectController.getTypeName()) as HandObjectController;
                if (handController) {
                    handController.testingMode = this.testingMode;
                }
            },
            onError: (error) => {
                print("❌ Error instantiating right hand: " + error);
            }
        });
    }

    onUpdate() {
        // Update all local hands
        if (this.myLeftHand) {
            this.myLeftHand.onUpdate();
        }
        if (this.myRightHand) {
            this.myRightHand.onUpdate();
        }
        
        // Update text position and content
        this.updateDistanceText();
    }

    private updateDistanceText() {
        // Only update if we have the text components and both hands
        if (!this.textDistanceText || !this.textDistanceObject || !this.myLeftHand || !this.myRightHand) {
            return;
        }

        // Position the text object at the midpoint of the hands
        const center = this.getMyHandsCenter();
        if (center) {
            this.textDistanceObject.getTransform().setWorldPosition(center);
        }

        // Update text content with distance and KameHameHa status
        if (this.myLeftHand.isHandTracked() && this.myRightHand.isHandTracked()) {
            const leftPos = this.myLeftHand.getWorldPosition();
            const rightPos = this.myRightHand.getWorldPosition();
            const distance = leftPos.distance(rightPos);
            
            // Check if KameHameHa should occur (using same logic as areMyHandsReady)
            const shouldActivate = distance <= 20.0; // You can adjust this threshold
            const status = shouldActivate ? "🔥 KAME HAME HA READY!" : "⏳ Move hands closer";
            
            // Check if KameHameHa state changed and notify subscribers
            if (shouldActivate !== this.lastKameHameHaState) {
                this.lastKameHameHaState = shouldActivate;
                this.notifyKameHameHaReady(shouldActivate);
            }
            
            // Format the text with distance and status
            this.textDistanceText.text = `Distance: ${distance.toFixed(1)}cm\n${status}`;
            
            // Change text color based on status
            if (shouldActivate) {
                this.textDistanceText.textFill.color = new vec4(0, 1, 0, 1); // Green
            } else {
                this.textDistanceText.textFill.color = new vec4(1, 1, 0, 1); // Yellow
            }
        } else {
            // Show tracking status when hands aren't tracked
            const leftTracked = this.myLeftHand.isHandTracked();
            const rightTracked = this.myRightHand.isHandTracked();
            
            if (!leftTracked && !rightTracked) {
                this.textDistanceText.text = "❌ No hands tracked";
            } else if (!leftTracked) {
                this.textDistanceText.text = "❌ Left hand not tracked";
            } else if (!rightTracked) {
                this.textDistanceText.text = "❌ Right hand not tracked";
            }
            
            this.textDistanceText.textFill.color = new vec4(1, 0, 0, 1); // Red
            
            // If hands are not tracked, KameHameHa is not ready
            if (this.lastKameHameHaState) {
                this.lastKameHameHaState = false;
                this.notifyKameHameHaReady(false);
            }
        }
    }

    // Public methods for external systems
    getMyLeftHand(): HandObjectController | null {
        return this.myLeftHand || null;
    }

    getMyRightHand(): HandObjectController | null {
        return this.myRightHand || null;
    }

    getMyHandsCenter(): vec3 | null {
        if (!this.myLeftHand || !this.myRightHand) {
            return null;
        }

        const leftPos = this.myLeftHand.getWorldPosition();
        const rightPos = this.myRightHand.getWorldPosition();
        
        return new vec3(
            (leftPos.x + rightPos.x) / 2,
            (leftPos.y + rightPos.y) / 2,
            (leftPos.z + rightPos.z) / 2
        );
    }

    areMyHandsReady(): boolean {
        if (!this.myLeftHand || !this.myRightHand) {
            print("🔍 DEBUG: Missing hands - left:" + !!this.myLeftHand + " right:" + !!this.myRightHand);
            this.textLog.text = "🔍 DEBUG: Missing hands - left:" + !!this.myLeftHand + " right:" + !!this.myRightHand;
            return false;
        }

        if (!this.myLeftHand.isHandTracked() || !this.myRightHand.isHandTracked()) {
            print("🔍 DEBUG: Hands not tracked - left:" + this.myLeftHand.isHandTracked() + " right:" + this.myRightHand.isHandTracked());
            this.textLog.text = "🔍 DEBUG: Hands not tracked - left:" + this.myLeftHand.isHandTracked() + " right:" + this.myRightHand.isHandTracked();
            return false;
        }

        // Check if hands are close together (within 20cm)
        const leftPos = this.myLeftHand.getWorldPosition();
        const rightPos = this.myRightHand.getWorldPosition();
        const distance = leftPos.distance(rightPos);
        
        print(`🔍 DEBUG: My hands distance: ${distance.toFixed(2)}cm (threshold: 20cm)`);
        this.textLog.text = `🔍 DEBUG: My hands distance: ${distance.toFixed(2)}cm (threshold: 20cm)`;
        
        const isReady = distance <= 20.0; // Use the 20cm threshold
        if (isReady) {
            print("✅ DEBUG: My hands are READY!");
            this.textLog.text = "✅ DEBUG: My hands are READY!";
        }
        
        return isReady;
    }

    getAllRemoteHands(): HandObjectController[] {
        return this.allHands.filter(hand => !hand.isLocalHand());
    }

    isKameHameHaReady(): boolean {
        return this.areMyHandsReady();
    }

    subscribeToKameHameHaReady(callback: (isReady: boolean) => void) {
        this.onKameHameHaReadyCallbacks.push(callback);
    }

    private notifyKameHameHaReady(isReady: boolean) {
        print(`🔥 KameHameHa state changed: ${isReady ? "READY" : "NOT READY"}`);
        this.onKameHameHaReadyCallbacks.forEach(callback => callback(isReady));
    }

    subscribeToHandsReady(callback: (leftHand: HandObjectController, rightHand: HandObjectController) => void) {
        this.onHandsReadyCallbacks.push(callback);
    }

    private notifyHandsReady(leftHand: HandObjectController, rightHand: HandObjectController) {
        this.onHandsReadyCallbacks.forEach(callback => callback(leftHand, rightHand));
    }

    onStart() {
        SessionController.getInstance().notifyOnReady(() => {
            this.instantiator.notifyOnReady(() => {
                this.instantiateHandObjects();
            });
        });
    }

    onAwake() {
        this.createEvent("OnStartEvent").bind(() => this.onStart());
    }
}

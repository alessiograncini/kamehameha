import { SyncEntity } from "SpectaclesSyncKit.lspkg/Core/SyncEntity";
import { StorageProperty } from "SpectaclesSyncKit.lspkg/Core/StorageProperty";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";

// Forward declaration to avoid circular imports
declare class LineObjectManager extends BaseScriptComponent {
  subscribe(lineObject: LineObjectController): void;
}

@component
export class LineObjectController extends BaseScriptComponent {
  @input
  lineObjectManager: LineObjectManager;

  @input
  lineType: string = "start"; // "start" or "end"

  @input
  testingMode: boolean = false;

  private syncEntity: SyncEntity;
  private transform: Transform = this.sceneObject.getTransform();
  private previousPos: vec3 = new vec3(0, 0, 0);
  private frameCounter: number = 0;

  onUpdate() {
    this.frameCounter++;
    
    // Only update position for local player's line objects
    if (!this.syncEntity || !this.syncEntity.networkRoot.locallyCreated) {
      // For remote objects, log position changes for debugging
      if (this.frameCounter % 60 === 0) { // Every 60 frames
        const currentPos = this.getWorldPosition();
        if (!currentPos.equal(this.previousPos)) {
          print(`📍 Remote ${this.lineType} position update: (${currentPos.x.toFixed(4)}, ${currentPos.y.toFixed(4)}, ${currentPos.z.toFixed(4)})`);
          this.previousPos = currentPos;
        }
      }
      return;
    }

    // Position will be updated by LineObjectManager through setPosition method
    // This onUpdate is mainly for sync purposes
  }

  onStart() {
    // Get the SyncEntity from the SyncTransform that's already on the scene object
    this.syncEntity = SyncEntity.getSyncEntityOnSceneObject(this.sceneObject);

    this.syncEntity.notifyOnReady(() => {
      if (this.syncEntity.networkRoot.locallyCreated) {
        // This is MY line object representation
        print(`Setting up local ${this.lineType} line object`);
        
        // Set initial position to origin
        this.previousPos = vec3.zero();
        this.transform.setWorldPosition(this.previousPos);

        // Enable the line object content and subscribe to LineObjectManager
        this.sceneObject.name = this.sceneObject.name + ` (Local ${this.lineType} Line)`;
        
        // Safely enable child object if it exists
        if (this.sceneObject.getChildrenCount() > 0) {
          this.sceneObject.getChild(0).enabled = true;
        } else {
          print(`Warning: LineObjectController ${this.lineType} has no child objects to enable`);
        }
        
        this.lineObjectManager.subscribe(this);
        
        // Bind update event
        this.createEvent("UpdateEvent").bind(() => this.onUpdate());
      } else {
        // This represents another player's line object
        print(`Setting up remote ${this.lineType} line object`);
        this.sceneObject.name = this.sceneObject.name + ` (Remote ${this.lineType} Line)`;
        
        // Safely enable child object if it exists
        if (this.sceneObject.getChildrenCount() > 0) {
          this.sceneObject.getChild(0).enabled = true;
        } else {
          print(`Warning: Remote LineObjectController ${this.lineType} has no child objects to enable`);
        }
        
        // Subscribe to LineObjectManager so remote objects are tracked
        this.lineObjectManager.subscribe(this);
        
        // Log initial position for debugging
        const initialPos = this.getWorldPosition();
        print(`📍 Remote ${this.lineType} line initial position: (${initialPos.x.toFixed(4)}, ${initialPos.y.toFixed(4)}, ${initialPos.z.toFixed(4)})`);
        
        // Bind update event to track remote position changes
        this.createEvent("UpdateEvent").bind(() => this.onUpdate());
      }
    });
  }

  setPosition(position: vec3) {
    // Smooth position update
    const updatePos = vec3.lerp(this.previousPos, position, getDeltaTime() * 10);
    this.transform.setWorldPosition(updatePos);
    this.previousPos = updatePos;
  }

  getWorldPosition(): vec3 {
    return this.transform.getWorldPosition();
  }

  getLineType(): string {
    return this.lineType;
  }

  isLocalLine(): boolean {
    return this.syncEntity && this.syncEntity.networkRoot && this.syncEntity.networkRoot.locallyCreated;
  }

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
  }
}

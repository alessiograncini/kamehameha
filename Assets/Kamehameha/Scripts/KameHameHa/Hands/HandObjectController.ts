import { SyncEntity } from "SpectaclesSyncKit.lspkg/Core/SyncEntity";
import { StorageProperty } from "SpectaclesSyncKit.lspkg/Core/StorageProperty";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import TrackedHand from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/TrackedHand";
import { SIK } from "SpectaclesInteractionKit.lspkg/SIK";

// Forward declaration to avoid circular imports
declare class HandObjectManager extends BaseScriptComponent {
  subscribe(handObject: HandObjectController): void;
}

@component
export class HandObjectController extends BaseScriptComponent {
  @input
  handObjectManager: HandObjectManager;

  @input
  handType: string = "left"; // "left" or "right"

  @input
  testingMode: boolean = false;

  private syncEntity: SyncEntity;
  private cameraTransform: Transform = WorldCameraFinderProvider.getInstance().getTransform();
  private transform: Transform = this.sceneObject.getTransform();
  private previousPos: vec3 = new vec3(0, 0, 0);
  
  // Hand tracking references (using SIK)
  private trackedHand: TrackedHand;

  onUpdate() {
    // Only update position for local player's hands
    if (!this.syncEntity || !this.syncEntity.networkRoot.locallyCreated) {
      return;
    }

    let newPos: vec3;

    if (this.testingMode) {
      // Testing mode: use camera position with offset
      const cameraPos = this.cameraTransform.getWorldPosition();
      const forward = this.cameraTransform.forward.uniformScale(20); // 20cm forward
      const handsCenter = cameraPos.add(forward);
      
      // Offset left/right based on hand type
      const lateralOffset = this.handType === "left" ? new vec3(-5, 0, 0) : new vec3(5, 0, 0);
      newPos = handsCenter.add(lateralOffset);
      
      print(`📝 Testing: ${this.handType} hand at (${newPos.x.toFixed(2)}, ${newPos.y.toFixed(2)}, ${newPos.z.toFixed(2)})`);
    } else {
      // Normal mode: use SIK hand tracking
      if (this.trackedHand && this.trackedHand.isTracked()) {
        newPos = this.trackedHand.getPalmCenter();
      } else {
        // Hand not tracked, keep previous position or hide
        this.sceneObject.enabled = false;
        return;
      }
    }

    // Smooth position update
    const updatePos = vec3.lerp(this.previousPos, newPos, getDeltaTime() * 10);
    this.transform.setWorldPosition(updatePos);
    this.previousPos = updatePos;
    this.sceneObject.enabled = true;
  }

  onStart() {
    // Get the SyncEntity from the SyncTransform that's already on the scene object
    this.syncEntity = SyncEntity.getSyncEntityOnSceneObject(this.sceneObject);

    this.syncEntity.notifyOnReady(() => {
      if (this.syncEntity.networkRoot.locallyCreated) {
        // This is MY hand representation
        print(`Setting up local ${this.handType} hand`);
        
        // Initialize hand tracking
        this.trackedHand = SIK.HandInputData.getHand(this.handType as any);
        
        // Set initial position
        if (this.testingMode) {
          const cameraPos = this.cameraTransform.getWorldPosition();
          const forward = this.cameraTransform.forward.uniformScale(20);
          const handsCenter = cameraPos.add(forward);
          const lateralOffset = this.handType === "left" ? new vec3(-5, 0, 0) : new vec3(5, 0, 0);
          this.previousPos = handsCenter.add(lateralOffset);
        } else if (this.trackedHand && this.trackedHand.isTracked()) {
          this.previousPos = this.trackedHand.getPalmCenter();
        } else {
          this.previousPos = vec3.zero();
        }
        
        this.transform.setWorldPosition(this.previousPos);

        // Enable the hand object content and subscribe to HandObjectManager
        this.sceneObject.name = this.sceneObject.name + ` (Local ${this.handType} Hand)`;
        this.sceneObject.getChild(0).enabled = true;
        this.handObjectManager.subscribe(this);
      } else {
        // This represents another player's hand
        print(`Setting up remote ${this.handType} hand`);
        this.sceneObject.name = this.sceneObject.name + ` (Remote ${this.handType} Hand)`;
        this.sceneObject.getChild(0).enabled = true;
      }
    });
  }

  getWorldPosition(): vec3 {
    return this.transform.getWorldPosition();
  }

  getHandType(): string {
    return this.handType;
  }

  isLocalHand(): boolean {
    return this.syncEntity && this.syncEntity.networkRoot && this.syncEntity.networkRoot.locallyCreated;
  }

  isHandTracked(): boolean {
    if (this.testingMode) {
      return true; // Always tracked in testing mode
    }
    return this.trackedHand && this.trackedHand.isTracked();
  }

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
  }
}

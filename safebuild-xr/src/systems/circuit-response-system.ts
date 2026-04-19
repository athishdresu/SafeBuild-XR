import {
  createSystem,
  PanelUI,
  PanelDocument,
  UIKitDocument,
  UIKit,
  MeshStandardMaterial,
  Color,
  eq,
} from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { LEDLight } from '../components/circuit.js';
import type { ApiResult } from './submit-system.js';

const GREEN = new Color(0, 1, 0.2);
const RED = new Color(1, 0.05, 0.05);
const OFF = new Color(0, 0, 0);

export class CircuitResponseSystem extends createSystem({
  led: { required: [LEDLight] },
  panel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', './ui/circuit.json')],
  },
}) {
  private flashTimer = 0;
  private flashOn = false;

  init() {
    const circuitResult = this.globals.circuitResult as Signal<ApiResult | null>;
    const currentPin = this.globals.currentPin as Signal<string>;

    this.cleanupFuncs.push(
      currentPin.subscribe((pin) => {
        this.updatePanelPin(pin);
      }),
    );

    this.cleanupFuncs.push(
      circuitResult.subscribe((result) => {
        if (!result) return;
        this.applyLED(result);
        this.updatePanelResult(result);
        if (result.state === 'OPEN') {
          (this.globals.resetKeypad as Signal<number>).value++;
        }
      }),
    );

    this.queries.panel.subscribe('qualify', () => {
      this.updatePanelPin(currentPin.peek());
      const result = circuitResult.peek();
      if (result) this.updatePanelResult(result);
    });
  }

  update(delta: number) {
    for (const entity of this.queries.led.entities) {
      if (entity.getValue(LEDLight, 'mode') !== 'flashing') continue;
      this.flashTimer += delta;
      if (this.flashTimer >= 0.5) {
        this.flashTimer = 0;
        this.flashOn = !this.flashOn;
        this.setLEDColor(entity, this.flashOn ? RED : OFF);
      }
    }
  }

  private applyLED(result: ApiResult) {
    for (const entity of this.queries.led.entities) {
      const mode =
        result.led === 'GREEN' ? 'green' :
        result.led === 'RED_FLASHING' ? 'flashing' : 'red';
      entity.setValue(LEDLight, 'mode', mode);
      this.flashTimer = 0;
      if (mode !== 'flashing') {
        this.setLEDColor(entity, mode === 'green' ? GREEN : RED);
      }
    }
  }

  private setLEDColor(entity: any, color: Color) {
    entity.object3D?.traverse((obj: any) => {
      if (obj.isMesh) {
        const mat = obj.material as MeshStandardMaterial;
        mat.emissive.copy(color);
        mat.emissiveIntensity = color.r + color.g + color.b > 0 ? 3 : 0;
      }
    });
  }

  private updatePanelPin(pin: string) {
    for (const entity of this.queries.panel.entities) {
      const doc = PanelDocument.data.document[entity.index] as UIKitDocument;
      if (!doc) continue;
      (doc.getElementById('pin-display') as UIKit.Text)?.setProperties({ text: pin });
    }
  }

  private updatePanelResult(result: ApiResult) {
    for (const entity of this.queries.panel.entities) {
      const doc = PanelDocument.data.document[entity.index] as UIKitDocument;
      if (!doc) continue;
      (doc.getElementById('circuit-state') as UIKit.Text)?.setProperties({ text: result.state });
      (doc.getElementById('tutor-msg') as UIKit.Text)?.setProperties({
        text: result.tutor_note ?? result.message,
      });
    }
  }
}

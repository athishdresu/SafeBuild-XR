import {
  createSystem,
  RayInteractable,
  Pressed,
  MeshStandardMaterial,
  Color,
} from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { KeyBit } from '../components/circuit.js';

const COLOR_ON = new Color(1, 0.5, 0);
const COLOR_OFF = new Color(0.08, 0.08, 0.08);

export class KeypadSystem extends createSystem({
  bits: { required: [KeyBit, RayInteractable] },
  pressed: { required: [KeyBit, Pressed] },
}) {
  init() {
    this.queries.pressed.subscribe('qualify', (entity) => {
      const isOn = !entity.getValue(KeyBit, 'isOn');
      entity.setValue(KeyBit, 'isOn', isOn);
      this.setEmissive(entity, isOn);
      this.syncPin();
    });

    const onKey = (e: KeyboardEvent) => {
      const bitIndex = { Digit1: 3, Digit2: 2, Digit3: 1, Digit4: 0 }[e.code];
      if (bitIndex === undefined) return;
      for (const entity of this.queries.bits.entities) {
        if (entity.getValue(KeyBit, 'bitIndex') === bitIndex) {
          const isOn = !entity.getValue(KeyBit, 'isOn');
          entity.setValue(KeyBit, 'isOn', isOn);
          this.setEmissive(entity, isOn);
          this.syncPin();
          break;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    this.cleanupFuncs.push(() => window.removeEventListener('keydown', onKey));

    this.cleanupFuncs.push(
      (this.globals.resetKeypad as Signal<number>).subscribe(() => {
        for (const entity of this.queries.bits.entities) {
          entity.setValue(KeyBit, 'isOn', false);
          this.setEmissive(entity, false);
        }
        (this.globals.currentPin as Signal<string>).value = '0000';
      }),
    );
  }

  private setEmissive(entity: any, isOn: boolean): void {
    (entity as any).object3D?.traverse((obj: any) => {
      if (obj.isMesh) {
        const mat = obj.material as MeshStandardMaterial;
        mat.emissive.copy(isOn ? COLOR_ON : COLOR_OFF);
        mat.emissiveIntensity = isOn ? 2.0 : 0;
      }
    });

    const bitIndex = entity.getValue(KeyBit, 'bitIndex') as number;
    const wireMats = this.globals.wireMats as MeshStandardMaterial[] | undefined;
    if (wireMats?.[bitIndex]) {
      const mat = wireMats[bitIndex];
      mat.emissive.set(isOn ? 0x00e633 : 0x000000);
      mat.emissiveIntensity = isOn ? 1.5 : 0;
    }
  }

  private syncPin() {
    const bits = ['0', '0', '0', '0'];
    for (const entity of this.queries.bits.entities) {
      const idx = entity.getValue(KeyBit, 'bitIndex') as number;
      bits[3 - idx] = entity.getValue(KeyBit, 'isOn') ? '1' : '0';
    }
    (this.globals.currentPin as Signal<string>).value = bits.join('');
  }
}

import { createSystem, Pressed } from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { SubmitButton } from '../components/circuit.js';

export interface ApiResult {
  state: 'OPEN' | 'ERROR' | 'LOCKED';
  led: 'GREEN' | 'RED' | 'RED_FLASHING';
  message: string;
  tutor_note?: string;
}

export class SubmitSystem extends createSystem({
  btn: { required: [SubmitButton, Pressed] },
}) {
  init() {
    this.queries.btn.subscribe('qualify', () => this.doSubmit());

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') this.doSubmit();
    };
    window.addEventListener('keydown', onKey);
    this.cleanupFuncs.push(() => window.removeEventListener('keydown', onKey));
  }

  private doSubmit() {
    const fetchPending = this.globals.fetchPending as Signal<boolean>;
    if (fetchPending.peek()) return;
    const result = (this.globals.circuitResult as Signal<ApiResult | null>).peek();
    if (result?.state === 'OPEN' || result?.state === 'LOCKED') return;

    fetchPending.value = true;
    const pin = (this.globals.currentPin as Signal<string>).peek();
    console.log('[SafeBuild XR] Submitting PIN:', pin);

    fetch('/api/input_code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    })
      .then((r) => r.json())
      .then((data: ApiResult) => {
        console.log('[SafeBuild XR] Response:', data);
        (this.globals.circuitResult as Signal<ApiResult | null>).value = data;
      })
      .catch(() => {
        console.error('[SafeBuild XR] Flask server unreachable on port 5001');
      })
      .finally(() => {
        fetchPending.value = false;
      });
  }
}

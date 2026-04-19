import { createComponent, Types } from '@iwsdk/core';

export const KeyBit = createComponent('KeyBit', {
  bitIndex: { type: Types.Int8, default: 0 },
  isOn: { type: Types.Boolean, default: false },
});

export const SubmitButton = createComponent('SubmitButton', {});

export const LEDLight = createComponent('LEDLight', {
  mode: {
    type: Types.Enum,
    enum: { Off: 'off', Green: 'green', Red: 'red', Flashing: 'flashing' },
    default: 'off',
  },
});

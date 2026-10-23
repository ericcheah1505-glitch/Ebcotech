// Option lists from the paper SERVICE REPORT form. Anything not in a list is stored as the
// free text typed under "Others".

export const PRODUCT_MODELS = [
  'HH150 EASY',
  'HH150 PREMIUM',
  'HH100',
  'HH200B',
  'HH350',
  'HH400',
  'HB220B',
  'FW8900',
  'SP8900',
  'TELESCOPIC DOOR',
  'MAGIC DOOR',
];
// Only these models come as a single or double door.
export const VARIANT_MODELS = ['HH150 EASY', 'HH150 PREMIUM', 'HH100', 'HH200B', 'HH350'];
export const DOOR_VARIANTS = ['SINGLE', 'DOUBLE'];
export const PRODUCT_BRANDS = ['GEWALT'];
export const HOUSE_BRAND = 'GEWALT';

export const OPEN_DEVICES = [
  'INFRARED SENSOR',
  'MICROWAVE SENSOR',
  'PUSH BUTTON & REC',
  'WAVE BUTTON & REC',
  'PHOTOCELL',
  'REMOTE CONTROL',
];
export const RAIL_LENGTHS = ['4.1 METER', '4.2 METER', '6.1 METER', '6.3 METER'];
export const MOTORS = ['100W CIRCLE', '75W SQUARE'];
export const CONTROLLERS = ['PREMIUM (orange+green)', 'EASY (white / blue)'];

export type Accessories = {
  open_device?: string[];
  open_device_other?: string;
  rail?: string;
  rail_cover?: string;
  motor?: string;
  controller?: string;
  others?: string;
};

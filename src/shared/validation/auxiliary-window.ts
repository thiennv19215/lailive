import { z } from 'zod';
import { AUXILIARY_WINDOW_NAMES } from '../contracts/auxiliary-windows';

export const auxiliaryWindowNameSchema = z.enum(AUXILIARY_WINDOW_NAMES);

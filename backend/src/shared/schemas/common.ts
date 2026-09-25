import { z } from "zod";

export const uuidParam = (name: string) => z.object({ [name]: z.string().uuid() });

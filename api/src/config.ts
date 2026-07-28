import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3333),
  HOST: z.string().default("0.0.0.0"),
  POSTGRES_URL: z.string().min(1),
  MONGODB_URI: z.string().min(1),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
});

export const config = schema.parse(process.env);


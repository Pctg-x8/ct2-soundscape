import { Config } from "drizzle-kit";
import DBCredentials from "./db_credentials";

export default {
    dialect: "sqlite",
    schema: "./src/schema.ts",
    out: "./migrations/",
    driver: "d1-http",
    dbCredentials: DBCredentials,
} satisfies Config;

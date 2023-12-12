// env augmentaion: https://zenn.dev/ken7253/articles/env-variable-type-definition
declare module "process" {
    global {
        namespace NodeJS {
            export interface ProcessEnv {
                readonly CONTENT_ID_ENCODER_KEY: string;
            }
        }
    }
}

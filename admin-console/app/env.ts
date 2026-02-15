declare module "react-router" {
    interface AppLoadContext {
        readonly env: Env;
        readonly executionContext: ExecutionContext;
    }
}

export {};

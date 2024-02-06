module Main (main) where

import Control.Monad (forM_)
import Data.Bifunctor (Bifunctor (bimap))
import Data.ByteString.Lazy.Char8 qualified as LBS8
import Data.Function ((&))
import System.Environment (getArgs)
import System.FilePath ((</>))
import Workflow.GitHub.Actions qualified as GHA
import Workflow.GitHub.Actions.Predefined.Checkout qualified as Checkout
import Workflow.GitHub.Actions.Predefined.Rust.Toolchain qualified as Rust
import Workflow.GitHub.Actions.Predefined.SetupPNPM qualified as SetupPNPM

secretCloudflareApiToken :: String
secretCloudflareApiToken = GHA.mkExpression "secrets.CLOUDFLARE_API_TOKEN"

secretCloudflareAccountID :: String
secretCloudflareAccountID = GHA.mkExpression "secrets.CLOUDFLARE_ACCOUNT_ID"

headlessAdminConsoleProjectName :: String
headlessAdminConsoleProjectName = "headless-admin-console"

adminConsoleProjectName :: String
adminConsoleProjectName = "ct2-soundscape-admin-console"

appProjectName :: String
appProjectName = "app"

withDeploymentEnvironments :: GHA.Step -> GHA.Step
withDeploymentEnvironments =
  GHA.env "CLOUDFLARE_ACCOUNT_ID" secretCloudflareAccountID . GHA.env "CLOUDFLARE_API_TOKEN" secretCloudflareApiToken

filterProject :: String -> SetupPNPM.RunInstallOption -> SetupPNPM.RunInstallOption
filterProject name opt = opt {SetupPNPM.runInstallArgs = SetupPNPM.runInstallArgs opt ++ ["-F", name]}

useFrozenLockfile :: SetupPNPM.RunInstallOption -> SetupPNPM.RunInstallOption
useFrozenLockfile opt = opt {SetupPNPM.runInstallArgs = SetupPNPM.runInstallArgs opt ++ ["--frozen-lockfile"]}

headlessAdminConsoleDeploymentJob :: GHA.Job
headlessAdminConsoleDeploymentJob =
  GHA.runInEnvironment (GHA.RepositoryEnvironment "prod:headless-admin-console") $
    GHA.namedAs "Deployment(Headless Admin Console)" $
      GHA.job
        [ GHA.namedAs "Checking out" $ Checkout.step Nothing,
          GHA.namedAs "Setup PNPM" $
            SetupPNPM.step
              [ SetupPNPM.runInstallOption & filterProject "shared" & filterProject headlessAdminConsoleProjectName & useFrozenLockfile
              ],
          GHA.namedAs "Setup Rust" $ Rust.step & Rust.useStable & Rust.forTarget "wasm32-unknown-unknown",
          GHA.namedAs "deploy" $ GHA.runStep "pnpm run deploy" & withDeploymentEnvironments & GHA.workAt "headless-admin-console"
        ]

adminConsoleDeploymentJob :: GHA.Job
adminConsoleDeploymentJob =
  GHA.runInEnvironment (GHA.RepositoryEnvironment "prod:admin-console") $
    GHA.namedAs "Deployment(Admin Console)" $
      GHA.job
        [ GHA.namedAs "Checking out" $ Checkout.step Nothing,
          GHA.namedAs "Setup PNPM" $
            SetupPNPM.step
              [ SetupPNPM.runInstallOption & filterProject "shared" & filterProject adminConsoleProjectName & useFrozenLockfile
              ],
          GHA.namedAs "deploy" $ GHA.runStep "pnpm run deploy" & withDeploymentEnvironments & GHA.workAt "admin-console"
        ]

appDeploymentJob :: GHA.Job
appDeploymentJob =
  GHA.runInEnvironment (GHA.RepositoryEnvironment "prod:app") $
    GHA.namedAs "Deployment(App)" $
      GHA.job
        [ GHA.namedAs "Checking out" $ Checkout.step Nothing,
          GHA.namedAs "Setup PNPM" $
            SetupPNPM.step
              [ SetupPNPM.runInstallOption & filterProject "shared" & filterProject appProjectName & useFrozenLockfile
              ],
          GHA.namedAs "deploy" $ GHA.runStep "pnpm run deploy" & withDeploymentEnvironments & GHA.workAt "app"
        ]

targets :: [(FilePath, GHA.Workflow)]
targets =
  [ ( "master-auto-deployment.yml",
      GHA.namedAs "Master Deployment"
        $ GHA.concurrentPolicy (GHA.ConcurrentCancelledGroup "master-auto-deployment")
        $ GHA.buildWorkflow
          [ GHA.workflowJob "admin-console" adminConsoleDeploymentJob,
            GHA.workflowJob "app" appDeploymentJob,
            GHA.workflowJob "headless-admin-console" headlessAdminConsoleDeploymentJob
          ]
        $ GHA.onPush
        $ GHA.workflowPushTrigger & GHA.filterBranch "master"
    )
  ]

main :: IO ()
main = do
  base <- head <$> getArgs
  forM_ targets $ uncurry LBS8.writeFile . bimap (base </>) GHA.build

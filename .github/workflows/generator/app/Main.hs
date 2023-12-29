module Main (main) where

import Control.Monad (forM_)
import Data.Bifunctor (Bifunctor (bimap))
import Data.ByteString.Lazy.Char8 qualified as LBS8
import Data.Function ((&))
import System.Environment (getArgs)
import System.FilePath ((</>))
import Workflow.GitHub.Actions qualified as GHA
import Workflow.GitHub.Actions.Predefined.Checkout qualified as Checkout
import Workflow.GitHub.Actions.Predefined.SetupPNPM qualified as SetupPNPM

secretCloudflareApiToken :: String
secretCloudflareApiToken = GHA.mkExpression "secrets.CLOUDFLARE_API_TOKEN"

secretCloudflareAccountID :: String
secretCloudflareAccountID = GHA.mkExpression "secrets.CLOUDFLARE_ACCOUNT_ID"

adminConsoleProjectName :: String
adminConsoleProjectName = "ct2-soundscape-admin-console"

appProjectName :: String
appProjectName = "app"

withDeploymentEnvironments :: GHA.Step -> GHA.Step
withDeploymentEnvironments =
  GHA.env "CLOUDFLARE_ACCOUNT_ID" secretCloudflareAccountID . GHA.env "CLOUDFLARE_API_TOKEN" secretCloudflareApiToken

adminConsoleDeploymentJob :: GHA.Job
adminConsoleDeploymentJob =
  GHA.runInEnvironment (GHA.RepositoryEnvironment "prod:admin-console") $
    GHA.namedAs "Deployment(Admin Console)" $
      GHA.job
        [ GHA.namedAs "Checking out" $ Checkout.step Nothing,
          GHA.namedAs "Setup PNPM" $
            SetupPNPM.step
              [ SetupPNPM.runInstallOption
                  { SetupPNPM.runInstallArgs =
                      [ "--frozen-lockfile",
                        "-F",
                        "shared",
                        "-F",
                        adminConsoleProjectName
                      ]
                  }
              ],
          GHA.namedAs "deploy" $ GHA.workAt "admin-console" $ withDeploymentEnvironments $ GHA.runStep "pnpm run deploy"
        ]

appDeploymentJob :: GHA.Job
appDeploymentJob =
  GHA.runInEnvironment (GHA.RepositoryEnvironment "prod:app") $
    GHA.namedAs "Deployment(App)" $
      GHA.job
        [ GHA.namedAs "Checking out" $ Checkout.step Nothing,
          GHA.namedAs "Setup PNPM" $
            SetupPNPM.step
              [ SetupPNPM.runInstallOption {SetupPNPM.runInstallArgs = ["--frozen-lockfile", "-F", "shared", "-F", appProjectName]}
              ],
          GHA.namedAs "deploy" $ GHA.workAt "app" $ withDeploymentEnvironments $ GHA.runStep "pnpm run deploy"
        ]

targets :: [(FilePath, GHA.Workflow)]
targets =
  [ ( "master-auto-deployment.yml",
      GHA.namedAs "Master Deployment"
        $ GHA.concurrentPolicy (GHA.ConcurrentCancelledGroup "master-auto-deployment")
        $ GHA.buildWorkflow
          [ GHA.workflowJob "admin-console" adminConsoleDeploymentJob,
            GHA.workflowJob "app" appDeploymentJob
          ]
        $ GHA.onPush
        $ GHA.workflowPushTrigger & GHA.filterBranch "master"
    )
  ]

main :: IO ()
main = do
  base <- head <$> getArgs
  forM_ targets $ uncurry LBS8.writeFile . bimap (base </>) GHA.build

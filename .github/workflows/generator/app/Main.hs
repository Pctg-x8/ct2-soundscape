module Main (main) where

import Control.Monad (forM_)
import Data.Bifunctor (Bifunctor (bimap))
import Data.ByteString.Lazy.Char8 qualified as LBS8
import Data.Function ((&))
import System.Environment (getArgs)
import System.FilePath ((</>))
import Workflow.GitHub.Actions qualified as GHA
import Workflow.GitHub.Actions.Predefined.Checkout qualified as Checkout
import Workflow.GitHub.Actions.Predefined.SetupNode qualified as SetupNode

secretCloudflareApiToken :: String
secretCloudflareApiToken = GHA.mkExpression "secrets.CLOUDFLARE_API_TOKEN"

secretCloudflareAccountID :: String
secretCloudflareAccountID = GHA.mkExpression "secrets.CLOUDFLARE_ACCOUNT_ID"

withDeploymentEnvironments :: GHA.Step -> GHA.Step
withDeploymentEnvironments =
  GHA.env "CLOUDFLARE_ACCOUNT_ID" secretCloudflareAccountID . GHA.env "CLOUDFLARE_API_TOKEN" secretCloudflareApiToken

adminConsoleDeploymentJob :: GHA.Job
adminConsoleDeploymentJob =
  GHA.runInEnvironment (GHA.RepositoryEnvironment "prod:admin-console") $
    GHA.namedAs "Deployment(Admin Console)" $
      GHA.job
        [ GHA.namedAs "Checking out" $ Checkout.step Nothing,
          GHA.namedAs "Setup Node" $ SetupNode.step (SetupNode.Version "25"),
          GHA.namedAs "Install deps" $ GHA.runStep "npm ci --include-workspace-root -w admin-console -w shared",
          GHA.namedAs "deploy" $ GHA.runStep "npm run deploy -w admin-console" & withDeploymentEnvironments
        ]

appDeploymentJob :: GHA.Job
appDeploymentJob =
  GHA.runInEnvironment (GHA.RepositoryEnvironment "prod:app") $
    GHA.namedAs "Deployment(App)" $
      GHA.job
        [ GHA.namedAs "Checking out" $ Checkout.step Nothing,
          GHA.namedAs "Setup Node" $ SetupNode.step (SetupNode.Version "25"),
          GHA.namedAs "Install deps" $ GHA.runStep "npm ci --include-workspace-root -w app -w shared",
          GHA.namedAs "deploy" $ GHA.runStep "npm run deploy -w app" & withDeploymentEnvironments
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
  base <-
    getArgs >>= \case
      x : _ -> pure x
      [] -> error "base path requred"
  forM_ targets $ uncurry LBS8.writeFile . bimap (base </>) GHA.build

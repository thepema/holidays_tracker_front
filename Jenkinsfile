pipeline {
  agent any

  environment {
    // Configure these values in Jenkins (Manage Jenkins > System > Global properties).
    DEPLOY_SSH_CREDENTIALS_ID = 'holiday-tracker-deploy-key'
    DEPLOY_HOST = ''
    DEPLOY_USER = ''
    DEPLOY_PROD_PATH = '/var/www/holiday-tracker'
    DEPLOY_DEV_PATH = '/var/www/holiday-tracker-dev'
  }

  stages {
    stage('Install dependencies') {
      steps {
        sh 'node --version && npm --version'
        sh 'npm install --no-audit --no-fund'
      }
    }

    stage('Build') {
      steps {
        sh 'npm run build -- --configuration production'
      }
    }

    stage('Deploy') {
      when {
        anyOf {
          branch 'main'
          branch 'develop'
        }
      }
      steps {
        script {
          def remotePath = env.BRANCH_NAME == 'main' ? env.DEPLOY_PROD_PATH : env.DEPLOY_DEV_PATH
          def siteUrl = env.BRANCH_NAME == 'main'
            ? 'https://holiday-tracker.maisonzaro.com'
            : 'https://holiday-tracker.dev.maisonzaro.com'

          if (!env.DEPLOY_HOST?.trim() || !env.DEPLOY_USER?.trim()) {
            error('Configure DEPLOY_HOST and DEPLOY_USER in Jenkins before deploying.')
          }

          if (!remotePath?.trim()) {
            error("The deployment path for branch ${env.BRANCH_NAME} is empty.")
          }

          echo "Deploying ${env.BRANCH_NAME} to ${siteUrl} (${env.DEPLOY_HOST}:${remotePath})"

          sshagent(credentials: [env.DEPLOY_SSH_CREDENTIALS_ID]) {
            sh '''#!/bin/sh
              set -eu
              ssh -o BatchMode=yes "$DEPLOY_USER@$DEPLOY_HOST" "mkdir -p '$REMOTE_PATH'"
              rsync -az --delete -e "ssh -o BatchMode=yes" \
                dist/holidays-tracker-front/browser/ \
                "$DEPLOY_USER@$DEPLOY_HOST:$REMOTE_PATH/"
            '''
          }
        }
      }
      environment {
        REMOTE_PATH = "${env.BRANCH_NAME == 'main' ? env.DEPLOY_PROD_PATH : env.DEPLOY_DEV_PATH}"
      }
    }
  }

  post {
    success {
      echo 'Pipeline completed successfully.'
    }
    failure {
      echo 'Pipeline failed. Check the stage logs for details.'
    }
  }
}

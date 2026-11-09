pipeline {
  agent any

  environment {
    LETSENCRYPT_EMAIL = 'info@maisonzaro.com'
  }

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Configure deployment target') {
      steps {
        script {
          def branch = (env.BRANCH_NAME ?: env.GIT_BRANCH ?: 'unknown')
            .replaceFirst(/^origin\//, '')
            .replaceFirst(/^refs\/heads\//, '')
            .replaceFirst(/^\*\//, '')

          switch (branch) {
            case ['development', 'develop']:
              env.APP_NAME = 'holiday-tracker-front-dev'
              env.APP_DOMAIN = 'holiday-tracker.dev.maisonzaro.com'
              env.APP_PORT = '80'
              env.IMAGE_NAME = "holiday-tracker-front:dev-${env.BUILD_NUMBER}"
              break
            case 'main':
              env.APP_NAME = 'holiday-tracker-front'
              env.APP_DOMAIN = 'holiday-tracker.maisonzaro.com'
              env.APP_PORT = '80'
              env.IMAGE_NAME = "holiday-tracker-front:prod-${env.BUILD_NUMBER}"
              break
            default:
              def safeBranch = branch.replaceAll(/[^a-zA-Z0-9_.-]/, '-')
              env.APP_NAME = ''
              env.IMAGE_NAME = "holiday-tracker-front:${safeBranch}-${env.BUILD_NUMBER}"
              echo "Branch '${branch}' is not configured for deployment; build and verification only."
          }

          def deployEnabled = ['holiday-tracker-front-dev', 'holiday-tracker-front'].contains(env.APP_NAME)
          echo "Branch '${branch}': deploy=${deployEnabled}, domain=${env.APP_DOMAIN ?: 'n/a'}, port=${env.APP_PORT ?: 'n/a'}"
        }
      }
    }

    stage('Build and verify image') {
      steps {
        sh '''#!/bin/sh
          set -eu
          docker build --pull -t "$IMAGE_NAME" .
          docker run --rm "$IMAGE_NAME" nginx -t
        '''
      }
    }

    stage('Deploy') {
      when {
        expression { ['holiday-tracker-front-dev', 'holiday-tracker-front'].contains(env.APP_NAME) }
      }
      steps {
        sh '''#!/bin/sh
          set -eu
          docker rm -f "$APP_NAME" || true

          docker run -d \\
            --name "$APP_NAME" \\
            --restart unless-stopped \\
            --network proxy \\
            -e VIRTUAL_HOST="$APP_DOMAIN" \\
            -e VIRTUAL_PORT="$APP_PORT" \\
            -e LETSENCRYPT_HOST="$APP_DOMAIN" \\
            -e LETSENCRYPT_EMAIL="$LETSENCRYPT_EMAIL" \\
            "$IMAGE_NAME"
        '''
      }
    }

    stage('Health check') {
      when {
        expression { ['holiday-tracker-front-dev', 'holiday-tracker-front'].contains(env.APP_NAME) }
      }
      steps {
        sh '''#!/bin/sh
          set -eu
          attempt=1
          while [ "$attempt" -le 10 ]; do
            if docker exec "$APP_NAME" wget -q -O /dev/null http://127.0.0.1/; then
              echo "Health check passed inside container."
              exit 0
            fi
            echo "Waiting for app readiness (attempt $attempt/10)..."
            sleep 3
            attempt=$((attempt + 1))
          done
          echo "Health check failed; recent container logs:"
          docker logs --tail 50 "$APP_NAME" || true
          exit 1
        '''
      }
    }
  }
}

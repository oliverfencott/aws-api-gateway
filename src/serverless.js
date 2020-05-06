const AWS = require('aws-sdk')
const { Component, utils } = require('@serverless/core')

const {
  generateId,
  apiExists,
  createApi,
  validateEndpoints,
  createAuthorizers,
  createPaths,
  createMethods,
  createIntegrations,
  createDeployment,
  removeApi,
  removeMethods,
  removeAuthorizers,
  removeResources,
  removeOutdatedEndpoints,
  retry,
  log
} = require('./utils')

const sleep = (timeout) => new Promise((res) => setTimeout(res, timeout))

const defaults = {
  region: 'us-east-1',
  stage: 'dev',
  description: 'Serverless Components API',
  endpointTypes: ['EDGE']
}

class AwsApiGateway extends Component {
  async deploy(inputs = {}) {
    log(this)

    log('Deploying')

    const config = { ...defaults, ...inputs }

    config.name = this.state.name || `aws-api-gateway-${generateId()}`

    const { name, description, region, stage, endpointTypes } = config

    log(`Starting API Gateway deployment with name ${name} in the ${region} region`)

    const apig = new AWS.APIGateway({
      region,
      credentials: this.credentials.aws
    })

    const lambda = new AWS.Lambda({
      region: config.region,
      credentials: this.credentials.aws
    })

    let apiId = this.state.id || config.id

    if (!apiId) {
      log(`API ID not found in state. Creating a new API.`)
      apiId = await createApi({ apig, name, description, endpointTypes })
      log(`API with ID ${apiId} created.`)
      this.state.id = apiId
      await this.save()
    } else if (!(await apiExists({ apig, apiId }))) {
      throw Error(`the specified api id "${apiId}" does not exist`)
    }

    log(`Validating ownership for the provided endpoints for API ID ${apiId}.`)

    let endpoints = await validateEndpoints({
      apig,
      apiId,
      endpoints: config.endpoints,
      state: this.state,
      stage,
      region
    })

    log(`Deploying authorizers if any for API ID ${apiId}.`)

    endpoints = await createAuthorizers({ apig, lambda, apiId, endpoints })

    log(`Deploying paths/resources for API ID ${apiId}.`)

    endpoints = await createPaths({ apig, apiId, endpoints })

    log(`Deploying methods for API ID ${apiId}.`)

    endpoints = await createMethods({ apig, apiId, endpoints })

    log(`Sleeping for couple of seconds before creating method integration.`)

    // need to sleep for a bit between method and integration creation
    await sleep(2000)

    log(`Creating integrations for the provided methods for API ID ${apiId}.`)

    endpoints = await createIntegrations({ apig, lambda, apiId, endpoints })

    log(`Removing any old endpoints for API ID ${apiId}.`)

    // keep endpoints in sync with provider
    await removeOutdatedEndpoints({
      apig,
      apiId,
      endpoints,
      stateEndpoints: this.state.endpoints || []
    })

    log(`Creating deployment for API ID ${apiId} in the ${stage} stage and the ${region} region.`)

    await retry(() => createDeployment({ apig, apiId, stage }))

    config.url = `https://${apiId}.execute-api.${region}.amazonaws.com/${stage}`

    this.state.endpoints = endpoints
    this.state.name = config.name
    this.state.region = config.region
    this.state.stage = config.stage
    this.state.url = config.url
    await this.save()

    log(`Deployment successful for the API named ${name} in the ${region} region.`)
    log(`API URL is ${config.url}.`)

    const outputs = {
      name: config.name,
      id: apiId,
      endpoints,
      url: config.url
    }

    return outputs
  }

  async remove(inputs = {}) {
    log('Removing')

    const apig = new AWS.APIGateway({
      region: this.state.region || defaults.region,
      credentials: this.credentials.aws
    })

    if (this.state.id) {
      log(`API ID ${this.state.id} found in state. Removing from the ${this.state.region}.`)
      await removeApi({ apig, apiId: this.state.id })

      log(
        `API with ID ${this.state.id} was successfully removed from the ${this.state.region} region.`
      )
    } else if (inputs.id && this.state.endpoints && this.state.endpoints.length !== undefined) {
      log(`No API ID found in state.`)
      log(`Removing any previously deployed authorizers.`)

      await removeAuthorizers({ apig, apiId: inputs.id, endpoints: this.state.endpoints })

      log(`Removing any previously deployed methods.`)

      await removeMethods({ apig, apiId: inputs.id, endpoints: this.state.endpoints })

      log(`Removing any previously deployed resources.`)

      await removeResources({ apig, apiId: inputs.id, endpoints: this.state.endpoints })
    }

    const outputs = {
      name: this.state.name,
      id: this.state.id,
      endpoints: this.state.endpoints,
      url: this.state.url
    }

    log(`Flushing state for the API Gateway component.`)

    this.state = {}
    await this.save()

    return outputs
  }
}

module.exports = AwsApiGateway

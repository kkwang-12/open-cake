'use strict';
const cloud = require('wx-server-sdk');
const { createHandler } = require('./shared/runtime');
const { createCloudIdentityRepository } = require('./shared/cloud-identity-repository');
const { AuthorizationModelError } = require('./shared/authorization-model');
const { nativeContextForInvocation } = require('./shared/native-context');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const settings = { appId: process.env.JJL_APP_ID, environment: process.env.JJL_CLOUD_ENV, stage: process.env.JJL_STAGE };
exports.main = createHandler({
  action: 'me',
  getContext: invocation => nativeContextForInvocation(cloud, invocation),
  settings,
  mapError: error => error instanceof AuthorizationModelError &&
    ['USER_DISABLED', 'USER_NOT_PROVISIONED', 'INVALID_USER_RECORD', 'AUTH_REQUIRED'].includes(error.code)
      ? 'AUTH_REQUIRED' : 'INTERNAL_ERROR',
  handle: async ({ subjectHash }, platformContext) => {
    const repository = createCloudIdentityRepository({
      getWXContext: () => platformContext,
      database: options => cloud.database(options)
    }, settings);
    await repository.ensureCustomer();
    return { authenticated: true, subjectHash, role: 'customer' };
  }
});

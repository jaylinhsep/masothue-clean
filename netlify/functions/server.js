let handlerPromise = null;

async function getHandler() {
  if (!handlerPromise) {
    handlerPromise = (async () => {
      const serverlessModule = await import('serverless-http');
      const serverless = serverlessModule.default || serverlessModule;
      const serverModule = await import('../../server.mjs');
      const app = serverModule.app || serverModule.default;
      return serverless(app);
    })();
  }
  return handlerPromise;
}

exports.handler = async (event, context) => {
  const h = await getHandler();
  return h(event, context);
};

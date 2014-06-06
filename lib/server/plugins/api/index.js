var _ = require('lodash/dist/lodash.underscore');

var path = require('path');
var nipple = require('nipple');

var hoodiejs = require('../../../helpers/pack_hoodie');
var plugins = require('../../../helpers/plugin_api');

exports.register = function (plugin, options, next) {

  var internals = {
    couchCfg: options.app.couch,
    uiKitPath: '/node_modules/hoodie-server/node_modules/hoodie-pocket-uikit/dist/',
    mapProxyPath: function (request, callback) {
      //use the bearer token as the cookie AuthSession for couchdb:
      if (request.headers.authorization && request.headers.authorization.substring(0, 'Bearer '.length) === 'Bearer ') {
        request.headers.cookie = 'AuthSession=' + request.headers.authorization.substring('Bearer '.length);
      }
      callback(null, internals.couchCfg.url + request.url.path.substr('/_api'.length), request.headers);
    },
    getHoodiePath: function (request, reply) {
      reply(hoodiejs(options.app))
      .type('application/javascript')
      .header(
        'Pragma', 'no-cache'
      );
    },
    notFound: function (request, reply) {
      reply({
        'error': 'not found'
      }).code(404);
    },
    handlePluginRequest: function (request, reply) {

      var hooks = options.app.hooks;
      var pluginName = request.params.name;
      if (!pluginName) {
        internals.notFound(request, reply);
        return;
      }

      var ran_hook = hooks.runDynamicForPlugin(pluginName, 'server.api.plugin-request', [request, reply]);

      if (!ran_hook) {
        internals.notFound(request, reply);
      }
    }
  };

  plugin.route([
    {
      method: 'GET',
      path: '/_api/{p*}',
      handler: {
        proxy: {
          passThrough: true,
          mapUri: internals.mapProxyPath
        }
      }
    },
    {
      method: 'PUT',
      path: '/_api/{p*}',
      handler: {
        proxy: {
          passThrough: true,
          mapUri: internals.mapProxyPath
        }
      }
    },
    {
      method: 'POST',
      path: '/_api/{p*}',
      handler: {
        proxy: {
          passThrough: true,
          mapUri: internals.mapProxyPath,
          onResponse: function (err, res, request, reply) {
            function extractToken(cookieHeader) {
              return (/AuthSession=(.*); Version(.*)/).exec(cookieHeader[0])[1];
            }
            if (err) {
              reply(err).code(500);
              return;
            }
            nipple.read(res, function (err, body) {
              var data, resp;
              if (err) {
                reply(err).code(500);
                return;
              }
              if (Array.isArray(res.headers['set-cookie'])) {
                data = JSON.parse(body);
                data.authToken = extractToken(res.headers['set-cookie']);
                delete res.headers['set-cookie'];
              }
              resp = reply(data).code(res.statusCode).hold();
              resp.headers = res.headers;
              resp.send();
            });
          }
        }
      }
    },
    {
      method: 'DELETE',
      path: '/_api/{p*}',
      handler: {
        proxy: {
          passThrough: true,
          mapUri: internals.mapProxyPath
        }
      }
    },
    {
      method: 'GET',
      path: '/_api/_plugins',
      handler: function (req, res) {
        res(plugins.metadata(options.app));
      }
    },
    {
      method: 'GET',
      path: '/_api/_plugins/{name}',
      handler: function (request, reply) {
        var metaData = _.find(plugins.metadata(options.app), function (doc) {
          return doc.name === request.params.name;
        });

        if (!metaData) {
          reply({
            'error': 'not found'
          }).code(404);
        } else {
          reply(metaData);
        }
      }
    },
    {
      method: 'HEAD',
      path: '/_api/_plugins/{name}/_api/{p*}',
      handler: internals.handlePluginRequest
    },
    {
      method: 'GET',
      path: '/_api/_plugins/{name}/_api/{p*}',
      handler: internals.handlePluginRequest
    },
    {
      method: 'PUT',
      path: '/_api/_plugins/{name}/_api/{p*}',
      handler: internals.handlePluginRequest
    },
    {
      method: 'POST',
      path: '/_api/_plugins/{name}/_api/{p*}',
      handler: internals.handlePluginRequest
    },
    {
      method: 'DELETE',
      path: '/_api/_plugins/{name}/_api/{p*}',
      handler: internals.handlePluginRequest
    },
    {
      method: 'GET',
      path: '/_api/_plugins/{name}/pocket',
      handler: function (req, res) {
        res.redirect('/');
      }
    },
    {
      method: 'GET',
      path: '/_api/_plugins/{name}/pocket/{path*}',
      handler: {
        directory: {
          path: function (request) {
            return plugins.pockets(options.app)[request.params.name];
          },
          listing: false,
          index: true
        }
      }
    },
    {
      method: 'GET',
      path: '/_api/_plugins/_assets/{path*}',
      handler: {
        directory: {
          path: function () {
            var projectDir = options.app.project_dir;
            var uiKitPath = internals.uiKitPath;
            if (projectDir.indexOf('hoodie-server') !== -1) {
              // we are running inside hoodie-server, e.g. in dev and test mode
              uiKitPath = uiKitPath.replace('/node_modules/hoodie-server', '');
            }
            var p = path.join(projectDir, uiKitPath);
            return p;
          },
          listing: true,
          index: false
        }
      }
    },
    {
      method: 'GET',
      path: '/_api/_files/hoodie.js',
      handler: internals.getHoodiePath
    }
  ]);

  return next();
};

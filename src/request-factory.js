'use strict';

/**
 * $RequestFactory to create $http and $resource
 * instances which can be abortable.
 */

angular.module('angular-abortable-requests', ['ngResource'])
  .constant('DEFAULT_REASON', 'ABORT')
  .factory('RequestFactory', [ '$resource', '$http',
    'Util', '$q', 'DEFAULT_REASON', function($resource, $http,
    Util, $q, DEFAULT_REASON) {

    function abortablePromiseWrap (promise, deferred, outstanding) {

      promise.then(function(){
        deferred.resolve.apply(deferred, arguments);
      });

      promise.catch(function() {
        deferred.reject.apply(deferred, arguments);
      });

      /**
      * Remove from the outstanding array
      * on abort when deferred is rejected
      * and/or promise is resolved/rejected.
      */
      deferred.promise.finally(function() {
        Util.removeFromArray(outstanding, deferred);
      });

      outstanding.push(deferred);
    }


    function createSageResource(config, cacheConfig) {
      var actions = config.actions || {},
        resource,
        outstanding = [];

      resource = $resource(config.url, config.options || null, actions);

      Object.keys(actions).forEach(function(action) {
        var method = resource[action];

        resource[action] = function() {
          var deferred = $q.defer(),
            promise = method.apply(null, arguments).$promise;

          abortablePromiseWrap(promise, deferred, outstanding);

          return {
            promise: deferred.promise,

            abort: function (reason) {
              deferred.reject(getRejectReason(reason));
            }

          };
        };
      });

      /**
      * Abort all the outstanding requests on
      * this $resource
      */
      resource.abortAll = function (reason) {
        angular.forEach(outstanding, function(deferred) {
          deferred.reject(getRejectReason(reason));
        });
        outstanding = [];
      };

      return resource;
    }

    function getRejectReason (reason) {
      if (!angular.isDefined(reason)) {
        return DEFAULT_REASON;
      }

      return reason;
    }

    function getHttpConfig (url) {
      return {
        method: 'GET',
        url: url
      };
    }

    function httpRequester(config) {

      // have a reference to original URL
      // to execute multiple times.
      var interpolateUrl = config.url,
        outstanding = [];

      return {

        /*
        * Abort all outstanding requests
        */
        abortAll: function(reason) {
          angular.forEach(outstanding, function(deferred) {
            deferred.reject(getRejectReason(reason));
          });
          outstanding = [];
        },

        /*
        * Executes the $http call with config
        */
        execute: function (options, params, data) {
          var uri, promise, deferred;

          config.url = interpolateUrl;

          //handle both absolute and relative paths
          //for query options interpolation
          //_.str.startsWith(config.url, 'http')
          //checks if string starts with 'http'
          if (config.url.substring(0, 4) === 'http'){
            uri = Util.disuniteHttp(config.url);
            config.url = uri.protocol + Util.interpolate(uri.url, options);
          } else {
            config.url = Util.interpolate(config.url, options);
          }

          angular.extend(config, params, data);

          deferred = $q.defer();
          promise = $http(config);

          abortablePromiseWrap(promise, deferred, outstanding);

          return {

            promise: deferred.promise,

            abort: function(reason) {
              deferred.reject(getRejectReason(reason));
            }
          };
        }

      };
    }

    return {

      /**
      * Creates a resource with abort APIs
      * @params config { url, options, actions } obj for $resource
      */
      createResource: function(config) {
        return createSageResource(config);
      },

      /**
      * Returns a http requester with execute method.
      * config is a url for GET if its a string
      * @params config is String(url)| Object for $http
      */
      createHttpRequester: function(config) {
        if (angular.isString(config)) {
          config = getHttpConfig(config);
        }
        return httpRequester(config);
      }

    };

  }]);

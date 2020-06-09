import { check, Match } from 'meteor/check';
import { PubSubLite } from 'meteor/npvn:pub-sub-lite';

export class ValidatedMethod {
  constructor(options) {
    // Default to no mixins
    options.mixins = options.mixins || [];
    check(options.mixins, [Function]);
    check(options.name, String);
    options = applyMixins(options, options.mixins);

    if (options.connection) {
      // Make sure we have a valid connection object
      if (typeof options.connection !== 'object' || !options.connection.methods)
        throw new Error('Invalid connection type');
    } else {
      // connection argument defaults to Meteor, which is where Methods are defined on client and
      // server
      options.connection = Meteor;
    }

    // Allow validate: null shorthand for methods that take no arguments
    if (options.validate === null) {
      options.validate = function () {};
    }

    // If this is null/undefined, make it an empty object
    options.applyOptions = options.applyOptions || {};

    check(
      options,
      Match.ObjectIncluding({
        name: String,
        validate: Function,
        run: Function,
        mixins: [Function],
        applyOptions: Object,
      })
    );

    // Validation for pub-sub-lite enhanced method calls
    if (
      options.applyOptions.cacheMethodResult &&
      options.applyOptions.cacheMethodResultInMinimongo
    )
      throw Error(
        `Please use either cacheMethodResult or cacheMethodResultInMinimongo for '${options.name}'.`
      );

    // Default options passed to Meteor.apply, can be overridden with applyOptions
    const defaultApplyOptions = {
      // Make it possible to get the ID of an inserted item
      returnStubValue: true,

      // Don't call the server method if the client stub throws an error, so that we don't end
      // up doing validations twice
      throwStubExceptions: true,
    };

    options.applyOptions = {
      ...defaultApplyOptions,
      ...options.applyOptions,
    };

    // Attach all options to the ValidatedMethod instance
    Object.assign(this, options);

    const method = this;
    // Support enhanced methods provided by the pub-sub-lite package
    this.connection[
      options.applyOptions.enhanced ||
      options.applyOptions.cacheMethodResult ||
      options.applyOptions.cacheMethodResultInMinimongo
        ? 'methodsEnhanced'
        : 'methods'
    ]({
      [options.name](args) {
        // Silence audit-argument-checks since arguments are always checked when using this package
        check(args, Match.Any);
        const methodInvocation = this;

        return method._execute(methodInvocation, args);
      },
    });
  }

  call(args, callback) {
    // Accept calling with just a callback
    if (typeof args === 'function') {
      callback = args;
      args = {};
    }

    // There's no method call caching on the server-side
    if (Meteor.isServer)
      return this.connection.apply(
        this.name,
        [args],
        this.applyOptions,
        callback
      );

    const enhancedCallback = (error, result) => {
      if (this.applyOptions.cacheMethodResult)
        PubSubLite.cacheMethodResult({
          name: this.name,
          args: [args],
          data: result,
          durationMs: this.applyOptions.cacheDurationMs,
        });
      if (this.applyOptions.cacheMethodResultInMinimongo)
        PubSubLite.cacheMethodResultInMinimongo({
          name: this.name,
          args: [args],
          data: result,
          collectionName: this.applyOptions.collectionName,
          durationMs: this.applyOptions.cacheDurationMs,
        });
      callback?.(error, result);
    };

    try {
      return this.connection[
        this.applyOptions.enhanced ||
        this.applyOptions.cacheMethodResult ||
        this.applyOptions.cacheMethodResultInMinimongo
          ? 'applyEnhanced'
          : 'apply'
      ](this.name, [args], this.applyOptions, enhancedCallback);
    } catch (err) {
      if (callback) {
        // Get errors from the stub in the same way as from the server-side method
        callback(err);
      } else {
        // No callback passed, throw instead of silently failing; this is what
        // "normal" Methods do if you don't pass a callback.
        throw err;
      }
    }
  }

  _execute(methodInvocation = {}, args) {
    // Add `this.name` to reference the Method name
    methodInvocation.name = this.name;

    const validateResult = this.validate.bind(methodInvocation)(args);

    if (typeof validateResult !== 'undefined') {
      throw new Error(`Returning from validate doesn't do anything; \
perhaps you meant to throw an error?`);
    }

    return this.run.bind(methodInvocation)(args);
  }
}

// Mixins get a chance to transform the arguments before they are passed to the actual Method
function applyMixins(args, mixins) {
  // Save name of the method here, so we can attach it to potential error messages
  const { name } = args;

  mixins.forEach(mixin => {
    args = mixin(args);

    if (!Match.test(args, Object)) {
      const functionName = mixin.toString().match(/function\s(\w+)/);
      let msg = 'One of the mixins';

      if (functionName) {
        msg = `The function '${functionName[1]}'`;
      }

      throw new Error(
        `Error in ${name} method: ${msg} didn't return the options object.`
      );
    }
  });

  return args;
}

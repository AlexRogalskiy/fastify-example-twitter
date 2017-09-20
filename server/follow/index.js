'use strict'

const serie = require('fastseries')()

const {
  follow: followSchema,
  unfollow: unfollowSchema,
  followers: followersSchema
} = require('./schemas')
const FollowService = require('./FollowService')

module.exports = function (fastify, opts, next) {
  // See user/index.js for some little explainations
  serie(
    fastify,
    [
      registerEnv,
      registerRedis,
      decorateWithTweetService,
      decorateWithUserClient,
      registerRoutes
    ],
    opts,
    next
  )
}

function registerEnv (data, done) {
  const envOpts = {
    schema: {
      type: 'object',
      required: [ 'FOLLOW_REDIS_URL', 'USER_MICROSERVICE_BASE_URL' ],
      properties: {
        FOLLOW_REDIS_URL: { type: 'string', default: '127.0.0.1' },
        USER_MICROSERVICE_BASE_URL: { type: 'string', default: 'http://localhost:3001' }
      }
    },
    data: data
  }
  this.register(require('fastify-env'), envOpts, done)
}

function registerRedis (a, done) {
  this.register(require('fastify-redis'), {
    host: this.config.FOLLOW_REDIS_URL
  }, done)
}

function decorateWithTweetService (a, done) {
  const followService = new FollowService(this.redis)
  this.decorate('followService', followService)
  done()
}

const request = require('request-promise-native')
function decorateWithUserClient (a, done) {
  this.decorate('userClient', {
    getMe: (req) => {
      return request({
        uri: `${this.config.USER_MICROSERVICE_BASE_URL}/api/me`,
        method: 'GET',
        headers: {
          authorization: req.req.headers.authorization
        },
        json: true
      })
    }
  })

  done()
}

function registerRoutes (a, done) {
  const { followService, userClient } = this

  this.addHook('preHandler', async function (req, reply, done) {
    try {
      req.user = await userClient.getMe(req)
    } catch (e) {
      return done(e)
    }
    done()
  })

  this.post('/api/follow', followSchema, async function (req, reply) {
    const { userId } = req.body
    await followService.follow(req.user._id, userId)
    reply.code(204)
  })

  this.post('/api/unfollow', unfollowSchema, async function (req, reply) {
    const { userId } = req.body
    await followService.unfollow(req.user._id, userId)
    reply.code(204)
  })

  this.get('/api/following/me', async function (req, reply) {
    const tweets = await followService.getFollowing(req.user._id)
    return tweets
  })

  this.get('/api/followers/me', async function (req, reply) {
    const tweets = await followService.getFollowers(req.user._id)
    return tweets
  })

  this.get('/api/following/:userId', async function (req, reply) {
    const tweets = await followService.getFollowing(req.params.userId)
    return tweets
  })

  this.get('/api/followers/:userId', followersSchema, async function (req, reply) {
    const tweets = await followService.getFollowers(req.params.userId)
    return tweets
  })

  done()
}

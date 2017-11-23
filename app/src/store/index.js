import Vue from 'vue'
import Vuex from 'vuex'
import firebase from 'firebase'

Vue.use(Vuex)
Vue.use(firebase)

var firebaseApp = firebase.initializeApp({
  apiKey: 'AIzaSyCkqawqxYCd8qFKpykvEIevdsu44PKN5sU',
  authDomain: 'cward-cfpoint-devel.firebaseapp.com',
  databaseURL: 'https://cward-cfpoint-devel.firebaseio.com',
  projectId: 'cward-cfpoint-devel',
  storageBucket: 'cward-cfpoint-devel.appspot.com',
  messagingSenderId: '505843562851'
})
var db = firebaseApp.database()
var storage = firebase.storage()

export const store = new Vuex.Store({
  state: {
    formId: '1xrtWTn6mA-1zHvM6q8kRlPjoy0yLIAwOfjsv-nGhWPM', // FIXME: Shouldn't be hardcoded
    _debug: {
      'limitToFirst': 10
    },
    _isLoading: true,
    _currentUser: null,
    _submissions: [],
    _unreviewed: [],
    _approved: [],
    _rejected: [],
    _votes: {},
    _themes: [],
    _themesFilter: []
  },
  getters: {
    debug (state) {
      return (state._debug !== undefined)
    },
    themes (state) {
      return state._themes.sort()
    },
    themesFilter (state) {
      return state._themesFilter.sort()
    },
    isLoggedIn (state) {
      if (state._currentUser === undefined || state._currentUser === null) {
        return false
      }
      return true
    },
    isLoading (state) {
      return state._isLoading
    },
    currentUser (state) {
      return state._currentUser
    },
    submissions (state) {
      console.log('Loading data: all submissions')
      return state._submissions.sort((a, b) => a.type > b.type)
    },
    workshops (state) {
      return state._submissions.filter(s => s.type === 'Workshop')
    },
    presentations (state) {
      return state._submissions.filter(s => s.type === 'Presentation')
    },
    discussions (state) {
      return state._submissions.filter(s => s.type === 'Discussion')
    },
    unreviewed (state) {
      console.log('Loading data: unreviewed')
      let submissions = state._submissions
      let themesFilter = new Set(state._themesFilter)
      return submissions.filter(val =>
          (val.themes.filter(theme =>
            themesFilter.has(theme)
          ).length > 0) &&
          (state._unreviewed.indexOf(val.id) > -1)
        )
    },
    approved (state) {
      console.log('Loading data: approved')
      let submissions = state._submissions
      let themesFilter = new Set(state._themesFilter)
      return submissions.filter(val =>
          (val.themes.filter(theme =>
            themesFilter.has(theme)
          ).length > 0) &&
          (state._approved.indexOf(val.id) > -1)
        )
    },
    rejected (state) {
      console.log('Loading data: rejected')
      let submissions = state._submissions
      let themesFilter = new Set(state._themesFilter)
      return submissions.filter(val =>
          (val.themes.filter(theme =>
            themesFilter.has(theme)
          ).length > 0) &&
          (state._rejected.indexOf(val.id) > -1)
        )
    },
    getVoteCountPlus: (state) => (submissionId) => {
      try {
        return state._votes[submissionId].vote_count_plus
      } catch (e) {
        return 0
      }
    },
    getVoteCountMinus: (state) => (submissionId) => {
      try {
        return state._votes[submissionId].vote_count_minus
      } catch (e) {
        return 0
      }
    },
    getVoteTotal: (state) => (submissionId) => {
      try {
        return state._votes[submissionId].vote_total
      } catch (e) {
        return 0
      }
    },
    getSubmission: (state) => (submissionId) => {
      return state._submissions[submissionId]
    },
    db (state) {
      return db
    },
    storage (state) {
      return storage
    }
  },
  mutations: {  // triggered with "commit" and MUST BE SYNCHRONOUS
    logOutCurrentUser (state) {
      console.log('Logged out user!')
      state._currentUser = null
      state._isLoading = false
    },
    updateCurrentUser (state, user) {
      state._currentUser = user // FIXME: this brings in a lot of unwanted properties from firebase auth
    },
    toggleLoading (state, bool) {
      state._isLoading = bool
    },
    loadQueue (state, submissions) {
      console.log('mutations.loadQueue')
      let themes = {}
      for (let submission of submissions) {
        for (let theme of submission.themes) {
          themes[theme] = true
        }
      }
      themes = Object.keys(themes)
      state._themes = themes
      state._themesFilter = themes.slice() // get a copy
      state._submissions = submissions
    },
    loadSubmission (state, submission) {
      console.log(`Loading submission (${submission.id})`)
      const sid = submission.id
      Vue.set(state._submissions, sid, submission)
      console.log(`... loading submission (${submission.id}) complete.`)
    },
    refreshSubmissionStatus (state) {
      // state._isLoading = true
      if (!state._currentUser) {
        console.log('not logged in!')
        state._unreviewed = []
        state._approved = []
        state._rejected = []
        // state._isLoading = false
        return
      }
      let uid = state._currentUser.id
      let unreviewed = []
      let approved = []
      let rejected = []
      for (let submission of state._submissions) {
        let sid = submission.id
        let votes = submission.meta.votes
        if (votes === undefined) {
          console.log('No votes structure found ... using default')
          votes = {
            vote_total: 0,
            vote_count_total: 0,
            vote_count_plus: 0,
            vote_count_minus: 0,
            results: {[uid]: 0}
          }
          Vue.set(state._votes, sid, votes)  // FIXME: can this be done more lazily?
          unreviewed.push(sid)
        } else {
          Vue.set(state._votes, sid, votes)
          const myVote = votes.results[uid] || 0
          if (myVote === 1) {
            approved.push(sid)
          } else if (myVote === 0) {
            unreviewed.push(sid)
          } else if (myVote === -1) {
            rejected.push(sid)
          } else {
            throw new Error(`Invalid vote value for currentUser (${uid})! Must be 1, 0 or -1 data (${myVote})`)
          }
        }
        state._unreviewed = unreviewed
        state._approved = approved
        state._rejected = rejected
        // state._isLoading = false
      }
    },
    incrementVoteCount (state, payload) {
      return new Promise((resolve, reject) => {
        // console.log('store.mutations.incrementVoteCountPlus: ', submissionId)
        var submissionId = payload.submissionId
        var incrementValue = payload.incrementValue
        let path = '/programs/' + state.formId + '/submissions/' + submissionId + '/meta/votes'
        db.ref(path).once('value', (snapshot) => {
          console.log(Object.keys(snapshot.val()))
        })
        return db.ref(path)
          .transaction(function (votes) {
            const uid = state._currentUser.id
            console.log(`${path}`)
            console.log(`${submissionId} ${votes}`)
            console.log(votes === undefined, votes === null) // / FIXME: ?//////////////////////// THIS SHOULDN"T BE NULL AFTER VOTING
            if (votes !== undefined && votes !== null) {
              votes.results[uid] = incrementValue
              votes.vote_total = Object.values(votes.results).reduce((a, b) => {
                return a + b
              })
              votes.vote_count_total = Object.keys(votes.results).length
              votes.vote_count_plus = Object.values(votes.results).filter(val => val === 1).length
              votes.vote_count_minus = Object.values(votes.results).filter(val => val === -1).length
            } else {
              console.log('No voting data found, creating it now.')
              if (incrementValue === 1) {
                votes = {
                  vote_total: 1,
                  vote_count_total: 1,
                  vote_count_plus: 1,
                  vote_count_minus: 0,
                  results: {[uid]: 1}
                }
              } else {
                votes = {
                  vote_total: -1,
                  vote_count_total: 1,
                  vote_count_plus: 0,
                  vote_count_minus: 1,
                  results: {[uid]: -1}
                }
              }
            }
            Vue.set(state._votes, submissionId, votes)
            return resolve(votes) // transaction requires a return value!
          })
      })
    },
    updateThemesFilter (state, value) {
      state._themesFilter = value
    },
    updateSubmissionBucket (state, payload) {
      let submissionId = payload.submissionId
      let bucketName = payload.bucketName
      let incrementValue = payload.incrementValue
      let ix = state['_' + bucketName].indexOf(submissionId)
      // remove from existing bucket
      state['_' + bucketName].splice(ix, 1)
      // add to new bucket
      if (incrementValue === 1) {
        state['_approved'].push(submissionId)
      } else if (incrementValue === -1) {
        state['_rejected'].push(submissionId)
      } else {
        throw new Error(`Unexpected increment value (${incrementValue})!`)
      }
    }
  },
  actions: {
    updateThemesFilter ({ commit }, value) {
      console.log('actions.updateThemesFilter')
      commit('updateThemesFilter', value)
    },
    logInPopup ({ state, commit }) {
      console.log('actions.logInPopup')
      var provider = new firebase.auth.GoogleAuthProvider()
      provider.setCustomParameters({
        prompt: 'select_account'
      })
      firebase.auth().signInWithPopup(provider)
    },
    logOut ({ state, commit }) {
      console.log('actions.signOut')
      firebase.auth().signOut()
    },
    initAuth ({ state, commit, dispatch }) {
      console.log('actions.initAuth')
      firebase.auth().onAuthStateChanged(function (user) {
        if (user) {
          // User is signed in.
          user.id = user.uid
          console.log(`User logged in: ${user.email}`)
          commit('updateCurrentUser', user)
          let payload = {
            skip: 0,
            limit: 50
          }
          dispatch('loadSubmissions', payload)// .then(() => {
            // console.log('Done loading submissions. Refreshing submission status.')
            // dispatch('refreshSubmissionStatus')
          // })
        } else {
          commit('logOutCurrentUser')
        }
      }, function (error) {
        console.log(`ERROR: ${error}`)
      })
    },
    toggleLoading ({ state, commit }, bool) {
      console.log('actions.toggleLoading')
      commit('toggleLoading', bool)
    },
    loadSubmissions ({ commit, state }, payload) {
      console.log('actions.loadSubmissions')
      return new Promise((resolve, reject) => {
        if (state._debug === undefined || state._debug === null) {
          db.ref('programs/' + state.formId + '/submissions/')
          .orderByChild('id')
          .once('value', (snapshot) => {
            let submissions = Object.values(snapshot.val())
            commit('loadQueue', submissions)
            commit('refreshSubmissionStatus')
          }).then(() => {
            commit('toggleLoading', false)
          })
        } else {
          console.log('... calling firebase')
          db.ref('programs/' + state.formId + '/submissions/')
          .orderByChild('id')
          .limitToFirst(state._debug.limitToFirst)
          .once('value', (snapshot) => {
            console.log('... submissions loaded')
            let submissions = Object.values(snapshot.val())
            commit('loadQueue', submissions)
            commit('refreshSubmissionStatus')
          }).then(() => {
            commit('toggleLoading', false)
          })
        }
      })
    },
    incrementVoteCount ({ commit }, payload) {
      console.log('actions.incrementVoteCount')
      return new Promise((resolve, reject) => {
        commit('incrementVoteCount', payload)
        resolve()
      })
    },
    refreshSubmissionStatus ({ commit }) {
      console.log('actions.refreshSubmissionStatus')
      commit('refreshSubmissionStatus')
    },
    updateSubmissionBucket ({ commit }, submissionId) {
      console.log('action.updateSubmissionBucket')
      commit('updateSubmissionBucket', submissionId)
    }
  }
})

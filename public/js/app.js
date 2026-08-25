/* public/js/app.js — Gate 4 Phase A.
 *
 * Wires Form + Results to the backend. One fetch call to /api/generate.
 * Phase B will add a second fetch to /api/score; the orchestration lives
 * here, not inside Form or Results.
 */
(function () {
  'use strict'

  function handleGenerate(request) {
    // Always start from a clean slate.
    if (window.Results && typeof window.Results.clear === 'function') {
      window.Results.clear()
    }

    return fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            // Body wasn't JSON; synthesize an error object so the downstream
            // branch can still report something useful.
            return { error: 'Server returned a non-JSON response.' }
          })
          .then(function (data) {
            if (!response.ok) {
              var serverMessage =
                (data && typeof data.error === 'string' && data.error) ||
                'HTTP ' + response.status
              window.Results.error('Server error: ' + serverMessage)
              return
            }
            window.Results.render(data.variations || [], {
              duration_ms: data.duration_ms,
              model_used: data.model_used,
              tokens_in: data.tokens_in,
              tokens_out: data.tokens_out,
            })
          })
      })
      .catch(function (networkErr) {
        // eslint-disable-next-line no-console
        console.error('[app] generate fetch failed:', networkErr)
        window.Results.error(
          'Network error: could not reach the server. Is it running?'
        )
      })
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (window.Form && typeof window.Form.onSubmit === 'function') {
      window.Form.onSubmit(handleGenerate)
    } else {
      // eslint-disable-next-line no-console
      console.error('[app] window.Form is not available; form will not work.')
    }
  })
})()

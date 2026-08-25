/* public/js/app.js — Gate 4 Phase B.
 *
 * Wires Form + Results to the backend.
 *   1. POST /api/generate → get variations.
 *   2. POST /api/score in parallel for each variation (one fetch per
 *      variation, awaited via Promise.all; network/scorer errors become
 *      `null` entries instead of failing the whole render).
 *   3. Call Results.render(variations, meta, scores). Graceful degradation:
 *      if scores don't align with variations length, Results.render will
 *      skip the badges.
 *   4. If at least one score is null, show a non-blocking note banner via
 *      Results.setNote("Note: could not score some variations. ...").
 */
(function () {
  'use strict'

  function scoreOneVariation(variation) {
    return fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(variation),
    })
      .then(function (response) {
        return response.json().catch(function () {
          return { error: 'Non-JSON response from /api/score.' }
        })
      })
      .then(function (data) {
        // Server-side validation failure or scorer error → treat as null
        // so Results.render skips the badge for this variation.
        if (!data || data.error !== undefined) return null
        if (typeof data.total !== 'number' || typeof data.max_possible !== 'number') {
          return null
        }
        return data
      })
      .catch(function () {
        // Network error or unexpected exception → null.
        return null
      })
  }

  function handleGenerate(request) {
    // Always start from a clean slate.
    if (window.Results && typeof window.Results.clear === 'function') {
      window.Results.clear()
    }
    // Phase B: clear the note banner on every fresh generate.
    if (window.Results && typeof window.Results.setNote === 'function') {
      window.Results.setNote(null)
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

            var variations = Array.isArray(data.variations) ? data.variations : []
            var meta = {
              duration_ms: data.duration_ms,
              model_used: data.model_used,
              tokens_in: data.tokens_in,
              tokens_out: data.tokens_out,
            }

            if (variations.length === 0) {
              // Nothing to score; render the empty list and bail.
              window.Results.render(variations, meta)
              return
            }

            // Score all variations in parallel. Each fetch resolves to
            // either a ScoreResult-shaped object or null on any failure.
            Promise.all(variations.map(scoreOneVariation)).then(function (scores) {
              var anyNull = scores.some(function (s) { return s === null })
              if (anyNull && window.Results && typeof window.Results.setNote === 'function') {
                window.Results.setNote(
                  'Note: could not score some variations. Server may be busy.'
                )
              }
              window.Results.render(variations, meta, scores)
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
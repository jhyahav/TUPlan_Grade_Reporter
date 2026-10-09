/**
 * The manifest for both browsers, from one definition. The targets differ only in
 * `browser_specific_settings` (pinned by `manifest.test.ts`), and the version comes
 * from package.json so it is never written twice. Pure so it can be unit-tested.
 */

/** @typedef {'chrome' | 'firefox'} Target */

/** @type {readonly Target[]} */
export const TARGETS = ['chrome', 'firefox']

/**
 * Required for signing MV3 add-ons, and updates are matched on it, so it must never
 * change: a different id makes the next release a different add-on that no existing
 * install updates to.
 */
export const GECKO_ID = 'grade-reporter@tuplan.courses'

/**
 * Not 109, where MV3 landed: Firefox older than 115 (ESR) cannot verify current
 * add-on signatures, so the add-on would neither install nor update there.
 */
export const GECKO_MIN_VERSION = '115.0'

/**
 * Mandatory for new AMO submissions. Firefox before 140 ignores it, so the
 * KEY_FIREFOX_UNSUPPORTED_BY_MIN_VERSION lint warnings are expected; do not raise
 * `strict_min_version` to silence them.
 *
 * `websiteContent` because a grade histogram is page content. `none` would deny the
 * POST, and `personallyIdentifyingInfo` would claim names or ID numbers, which are
 * never sent. `required` because reporting is the whole purpose, and `optional`
 * needs a `permissions.request()` flow that does not exist here.
 *
 * It declares only what is sent (the course overlay only downloads). If that ever
 * changes, this key, the store disclosures and the privacy page change together.
 */
export const DATA_COLLECTION = { required: ['websiteContent'] }

/**
 * @param {Target} target
 * @param {string} version  From package.json.
 * @returns {Record<string, unknown>}
 */
export function buildManifest(target, version) {
  if (!TARGETS.includes(target)) {
    throw new Error(`unknown target "${target}" — expected one of ${TARGETS.join(', ')}`)
  }
  if (!/^\d+\.\d+(\.\d+)?$/.test(version)) {
    // Both stores reject what they cannot parse; fail at build time, not at upload.
    throw new Error(`version "${version}" is not a dotted numeric version`)
  }

  const manifest = {
    manifest_version: 3,
    default_locale: 'de',
    name: 'TUPlan Grade Reporter',
    version,
    description: '__MSG_extDescription__',
    content_scripts: [
      {
        matches: ['https://www.tucan.tu-darmstadt.de/*'],
        js: ['content-script.js'],
        css: ['content-script.css'],
        run_at: 'document_idle',
        all_frames: true,
      },
    ],
    action: {
      default_popup: 'popup.html',
      default_title: 'TUPlan Grade Reporter',
    },
    icons: {
      16: 'icons/icon-16.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  }

  if (target === 'firefox') {
    return {
      ...manifest,
      browser_specific_settings: {
        gecko: {
          id: GECKO_ID,
          strict_min_version: GECKO_MIN_VERSION,
          data_collection_permissions: DATA_COLLECTION,
        },
      },
    }
  }

  return manifest
}

/**
 * Neither manifest has `permissions` or `host_permissions`. Under MV3, host
 * permissions do not apply to content scripts; the report POST works because the
 * server opts in through CORS. Adding them would grant nothing and add a line to
 * the install dialog. If a request is ever blocked, move the `fetch` behind a
 * `sendMessage` to a background script instead.
 */

# NovaFlow desktop integration

English | [中文](INTEGRATION.zh.md)

This private workspace carries NovaFlow plugin 2.6.1 inside the customized desktop distribution. The original migration package remains separate. Install workspace dependencies at the repository root; use the repository's pnpm packaging commands for workspace dependency conversion.

## Account and startup

Desktop adds the NovaFlow bundle after the standard Web bundles and before user bundles. Existing profile dependencies and user patches remain intact. Native recovery retains the built-in NovaFlow bundle. The CLI dependency closure carries its code for runtime resolution, while ordinary CLI profiles do not activate it.

Welcome signs in through the plugin's authenticated, owner-only `/api/novaflow-account` endpoint. The main process polls safe local snapshots serially and opens only the validated NovaFlow authorization URL. It does not send tokens to the renderer. The plugin remains the sole owner of PKCE, callback validation, rotating credentials, model synchronization, balance, and logout.

The configured issuer is `https://www.ycnovaflow.vip`; the client identity is `novaflow-creator`. The browser requires the user's authorization. Workspace entry requires the plugin's connected state after account and model synchronization. An independent API key remains an alternative; local NovaFlow bridge credentials do not count as an independent login.

Transient synchronization failures can retry with the saved grant. Startup validates saved authorization automatically. Failed validation clears the local grant and returns the same entry screen as a new user, keeping native model settings. Automatic local cleanup does not revoke other copies of the session. Cancellation binds to the current attempt. Account sign-out and expiry in the workspace are reflected by native onboarding.

The welcome page reuses the plugin artwork. Chinese and English have NovaFlow-specific explanatory copy; the additional recovery copy uses English for other shell locales. Windows releases use the NovaFlow application name and independent installation identity. Build and update configuration is owned by the [Windows release manual](../desktop/novaflow-release/README.md).

## Windows and validation

The account plugin has no recommended-plugin installation UI, package-runtime checks or installer actions. Desktop seeds the pinned community plugins offline, including Skills Manager 1.4.11. Each package is offered once per profile, so adding a package to the seed leaves earlier removals and existing enablement choices intact. Legacy confirm_plugins, dismiss_plugins and retry_plugins requests return UNSUPPORTED_ACTION; account snapshots no longer contain pluginSetup. The core account row is hidden from plugin inventory and cannot be disabled, removed, replaced or edited through Host management APIs.

Media output paths inspect both Windows and POSIX separators. Job metadata uses DSH atomic writes with Windows replacement retries. Directory-link tests use Windows junctions; POSIX permission-bit assertions run only on POSIX systems.

Run the plugin's Node tests with `DSH_INSTALL_DIR` pointing to the built `apps/cli` directory. `apps/desktop/tests/welcome-flow.e2e.ts` launches the real built Host with a synthetic platform transport and verifies authorization, model configuration, restoration, sign-out, and cancelled callbacks without production credentials. Desktop renderer tests own locale snapshots and recovery interactions. Build the repository after changes.

Native window inspection and a real production account authorization are separate acceptance steps. Successful local tests do not establish production login or model-inference availability.

## Persistent authorization

The desktop client uses saved account credentials without a hardware or hostname check. The login request sends the display label NovaFlow Desktop. Local expiration metadata triggers refresh but does not independently reject a saved refresh token. Server-declared `refresh_token_rotation: "none"` enables reusable refresh credentials; with that mode, null `expires_in` or `refresh_expires_in` means no deadline. Legacy responses retain rotating-token behavior. The server remains responsible for issuing and accepting persistent credentials. HTTP 403 is a permission failure and does not erase authentication.

An uncertain legacy refresh calls `POST /api/novaflow/v1/desktop/auth/restore` with `refresh_token` and `session_id`, instead of replaying the one-use token against the legacy refresh endpoint. Recovery must return the same session with reusable refresh and no refresh expiry. Startup makes this recovery attempt silently; if it fails, local credentials are cleared and the ordinary sign-in entry is shown. No recovery page or expiry notification is presented. Closing the client during refresh does not revoke the saved session. Explicit sign-out still deletes local credentials and requests revocation, affecting every copied credential for that same session. PKCE, state, issuer and callback checks remain in place.

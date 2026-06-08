# Genesys Knowledge Fabric File Sync Manager Feature Guide

## Overview

Genesys Knowledge Fabric File Sync Manager is a user-facing web app for quickly preparing **FileUpload** knowledge sources in Genesys Cloud.

Its main purpose is to make it easy to demonstrate, test, and reset any Genesys Cloud experience that depends on Knowledge Fabric. Instead of setting up SharePoint, depending on another third-party knowledge system, or building a custom integration just to get sample content into Knowledge Fabric, users can do the essentials directly from this app:

- Create a new FileUpload source.
- Add real files from their device.
- Run a sync so those files become available in Genesys Cloud.
- Reset the source when a one-off demo is finished, or keep the source populated when the demo is meant to be reused.

This makes the app especially useful for demos, workshops, proof-of-concepts, enablement sessions, and repeatable testing scenarios where the important goal is to show the Genesys feature that consumes knowledge, not spend time preparing a separate content system.

## What The App Is For

Use this app when you need a fast, controlled way to put documents into Genesys Cloud Knowledge Fabric.

Good examples include:

- Preparing a demo knowledge source for a customer meeting.
- Loading a small document set for a proof-of-concept.
- Testing how a Genesys Cloud feature behaves with different knowledge articles or files.
- Keeping a generic demo source populated for future reuse, without creating new sources each time.
- Resetting a custom demo source after a one-off session when the content is no longer needed.
- Avoiding external connector setup when SharePoint or another content system is not required for the story.

The app is not meant to be the long-term system of record for company knowledge. Genesys Cloud remains the place where the source and uploaded content live. The app helps users prepare and manage that source more easily.

## Main Capabilities

### Source Management

The **Sources** page is where users manage their FileUpload sources.

From there, users can:

- See the sources already saved in the app.
- Discover existing sources from Genesys Cloud.
- Add an existing source by ID.
- Create a new FileUpload source.
- Start a sync for a source.
- Reset a source after a custom demo, or keep it populated for a reusable generic demo.
- Archive a local source reference if they no longer want to see it in the app.

For demo work, the most important action is usually **Create source**.

### File Sync

The app lets users select files from their device and push them into a FileUpload source.

During a sync, users can:

- Choose the source they want to populate.
- Select or drag and drop files.
- Review file names and validation messages before starting.
- Start the sync.
- Watch upload progress.
- See whether the run completed or needs attention.

The app is designed to be clear about outcomes. It should only show a successful completion when the selected files have successfully uploaded.

### Source Reset

The **Reset source** action empties a source so it can be reused with different content.

Whether you should reset depends on the type of demo:

| Demo type | Typical approach | Why |
|---|---|---|
| **Custom demo** | Reset after the demo ends | The content was built for one audience or scenario and is unlikely to be reused. Resetting clears that content and frees the source slot for the next custom story. |
| **Generic reusable demo** | Do **not** reset | The same file set is meant to be shown again and again. Leave the source populated so the next session can start immediately without re-uploading files or creating a new source. |

From a user standpoint, reset means:

- The current source is replaced with a new empty source.
- Existing content in the previous source is removed.
- The app updates its saved reference so the user can keep working with the clean source.

**Source limits matter.** Genesys Cloud organizations can only hold a limited number of knowledge sources. For generic demos, keeping one long-lived source populated is usually the better choice: you avoid consuming extra source slots and you skip the upload step on every repeat session. Reserve reset for custom demos where the content is truly disposable.

Use reset carefully. It is intended for one-off demos, testing, and controlled clean-up scenarios where clearing the source is expected.

### Run History

The **History** page gives users a local view of previous sync runs.

It helps answer questions like:

- Which source did I sync?
- How many files were uploaded?
- Did the run complete?
- Does anything need my attention?

Because the app does not use a centralized database, this history is saved locally on the user’s device. A different browser or device will not automatically have the same local history.

### Diagnostics

The **Diagnostics** page helps users confirm that the app can work with their Genesys Cloud setup.

It is useful before a demo because it helps identify missing configuration or access problems early, before the user is in front of an audience.

## Genesys Cloud Prerequisites

Before users can sign in, a Genesys Cloud administrator must create an OAuth client for the app.

### Required OAuth Client Setup

In Genesys Cloud Admin, create an OAuth client with the following setup:

| Setting | What To Use |
|---|---|
| OAuth grant type | Code Authorization with PKCE |
| Redirect URI | The app callback URL shown on the login screen |
| Local development redirect URI | `http://localhost:3000/api/auth/callback`, if running locally |
| Client secret | Not needed |
| Access | Knowledge permissions needed for the features users will use |

The login page shows the redirect URI that must be added to the OAuth client. Copy that value from the app and add it to the OAuth client’s authorized redirect URIs.

### Client ID

After the OAuth client is created, copy the **Client ID**.

Users need this Client ID on the login page, along with their Genesys Cloud region.

The app does not need the OAuth client secret. Users authenticate with their own Genesys Cloud account.

### Region

Users also need the Genesys Cloud region for their organization.

Examples:

- `mypurecloud.com`
- `mypurecloud.de`
- `mypurecloud.ie`
- `mypurecloud.com.au`
- `usw2.pure.cloud`

Use the region domain for the Genesys Cloud organization.

### Recommended Permissions

The OAuth client should allow the app to perform the knowledge actions that users need.

At minimum, the client must have the "Knowledge" scope granted.

## First-Time Login

To use the app, open the app URL and go to the login page.

The login page asks for:

- **Genesys Cloud region**
- **Client ID**

After entering those values, click **Sign in with Genesys**.

The user is redirected to Genesys Cloud, signs in with their own Genesys Cloud account, and then returns to the app.

The app does not use a shared admin login. Each user signs in as themselves, so the actions available in the app depend on that user’s Genesys Cloud access.

## Local Vault Password

After signing in, first-time users are asked to create local secure storage by choosing a vault passphrase.

This vault passphrase is important because the app does **not** use a centralized database to store each user’s saved sources, preferences, and run history. Instead, that app data is stored locally on the user’s own device.

The vault passphrase protects that local app data.

The local vault can include:

- Saved source references.
- Friendly source names.
- Sync run history.
- User preferences.
- Local app settings.

The vault does **not** mean the app is creating a new Genesys Cloud password. It is only for unlocking the app’s local data on that device.

### What Users Should Know About The Vault

- Choose a passphrase that is strong and memorable.
- The passphrase protects local app data on that browser/device.
- The passphrase is needed again when unlocking saved local data.
- If the passphrase is forgotten, the local app data cannot be recovered from the app.
- Resetting local data does not delete Genesys Cloud sources, but the user may need to add those sources back into the app.
- A different browser or device will have its own local vault.

This design keeps the app lightweight and portable while avoiding a central database for demo data.

## Happy Path: Create A Source, Upload Files, Then Decide Whether To Reset

The most common workflow is:

1. Go to **Sources**.
2. Create a new FileUpload source (or select an existing reusable one).
3. Start a sync for that source.
4. Drop files into the sync screen.
5. Run the sync.
6. Use the populated source in the Genesys Cloud feature you want to demonstrate.
7. **Custom demo:** reset the source when the session is over.
8. **Generic reusable demo:** leave the source as-is so it is ready for the next session.

This is the fastest way to prepare a Knowledge Fabric source for a demo without setting up SharePoint or another external knowledge connector.

## Step 1: Go To Sources

After login and vault unlock, open **Sources** from the app navigation.

The Sources page is the main place to manage knowledge sources for the app.

If no sources are saved yet, the page will guide the user to discover, add, or create one.

## Step 2: Create A New Source

On the Sources page, choose the option to create a source.

Give the source a clear name that matches the demo or scenario.

Examples:

- `Demo - Travel Policy`
- `Demo - Product Manuals`
- `POC - Healthcare FAQ`
- `Workshop - Retail Knowledge`

After creation, the source is added to the user’s saved source list and can be used for syncs.

## Step 3: Start A Sync

From the source, start a new sync.

The app opens the sync flow, where the user chooses the source and prepares the files.

Most demo flows use an incremental sync, which adds the selected files to the source.

If full sync is enabled for the environment, users may also see a full sync option. Use full sync only when the demo plan calls for replacing source content through that sync type.

## Step 4: Drop Files

On the sync screen, select or drag and drop the files that should be uploaded into the source.

Use files that represent the demo scenario clearly.

Good demo file sets are usually:

- Small enough to upload quickly.
- Named clearly.
- Focused on one scenario.
- Free of confidential or customer-sensitive information.
- Representative of the questions or journeys being demonstrated.

The app checks the selected files before upload. If a file needs attention, review the message and adjust the file selection before starting the sync.

## Step 5: Run The Sync

Start the sync when the file list looks correct.

The app shows progress while files are uploaded.

During the run, users can monitor:

- Overall progress.
- File-level upload status.
- Whether any file needs attention.
- Whether the sync completed successfully.

When the run completes, the source is ready to be used by the Genesys Cloud feature that relies on Knowledge Fabric.

## Step 6: Demonstrate The Genesys Cloud Feature

Once the files are synced, move to the Genesys Cloud feature or experience that uses Knowledge Fabric.

Examples may include:

- Knowledge configuration test queries.
- VAs or AVAs.
- Agent Copilot.

The value of this app is that the content setup is quick and repeatable. Users can focus on the feature demonstration instead of spending time configuring an external content platform.

## Step 7: After The Demo — Reset Or Keep The Source

What you do after the demo depends on whether it was a one-off custom session or a generic demo you plan to run again.

### Custom demo — reset when finished

For a custom demo built for a specific customer, workshop, or scenario, go back to **Sources** and use **Reset source** once the session is over.

Reset makes sense when:

- The content was tailored to one audience and will not be reused.
- The next demo needs a completely different knowledge set in the same source slot.
- You want to clear customer-specific or scenario-specific files before the next session.

The app asks for confirmation before resetting. Follow the prompt carefully.

After reset, the source is empty and ready for the next file sync.

### Generic reusable demo — keep the source populated

For a generic demo you run regularly — for example, a standard product walkthrough or an internal enablement session — **do not reset** the source.

Instead:

- Upload all the files the demo needs in one go (or add more over time with incremental syncs).
- Leave the source populated so the next session starts instantly.
- Reuse the same source across weeks or months without re-uploading.

This approach is especially important because Genesys Cloud organizations have a **limited number of knowledge sources**. Creating and resetting sources repeatedly consumes those slots. A single long-lived generic demo source is more efficient than spinning up a new one for every session.

## Recommended Demo Workflows

### Custom demo workflow

Use this pattern for one-off, audience-specific demos:

1. Create a source named for the scenario (e.g. `Demo - Acme Corp FAQ`).
2. Upload only the files needed for that session.
3. Run the Genesys Cloud demonstration.
4. **Reset the source** when the demo is over.

This keeps the org tidy and frees the source slot for the next custom story.

### Generic reusable demo workflow

Use this pattern for demos you run again and again:

1. Create a source with a stable, generic name (e.g. `Demo - Product Knowledge`).
2. Upload the full file set the demo requires.
3. Run the Genesys Cloud demonstration.
4. **Leave the source populated** — do not reset.
5. Reuse the same source in every future session without re-uploading.

This saves time, preserves source slots, and makes repeat demos predictable.

## Example Demo Scenarios

### Generic product documentation demo (reusable)

Create a source named `Demo - Product Docs`, upload product manuals or release notes, and demonstrate how the Genesys feature finds answers from that content. **Do not reset** — reuse this source in every product demo session.

### Custom policy FAQ demo (one-off)

Create a source named `Demo - Acme Travel Policy`, upload HR or travel policy files tailored to a specific customer conversation, run the demo, then **reset the source** when finished.

### Industry-specific custom demo (one-off)

Create a source named for the audience, such as `Demo - Retail FAQ` or `Demo - Healthcare FAQ`, upload scenario-specific files, run the demo, and **reset** if the content will not be reused.

### Before-and-after demo (custom)

Run a demo with one set of files, reset the source, upload a different set of files, and show how the experience changes when Knowledge Fabric is fed different knowledge. Reset is part of the story here, so it is expected.

## Practical Tips For Users

- Use clear source names so they are easy to identify later.
- Keep demo file sets focused and small.
- Avoid uploading confidential, regulated, or customer-sensitive files unless the environment is approved for that content.
- For **generic reusable demos**, keep one long-lived source populated and avoid resetting it.
- For **custom one-off demos**, reset the source after the session to clear scenario-specific content.
- Be mindful of Genesys Cloud source limits — prefer reusing existing sources over creating new ones.
- Check Diagnostics before important demos.
- Keep the vault passphrase somewhere safe according to your organization’s policy.
- Remember that local history is tied to the current browser/device.

## What To Do If Something Needs Attention

Sometimes a sync may show that it needs user attention.

This can happen if:

- A file could not be uploaded.
- The browser was closed or refreshed during upload.
- The user lost network connectivity.
- Genesys Cloud did not return a clear final result.
- The selected files need to be chosen again.

When this happens, review the run details in the app. Depending on the situation, the user may need to retry the sync, reselect files, verify the source in Genesys Cloud, or reset the source before trying again.

The app is intentionally cautious. If it cannot confidently confirm success, it should not present the run as successfully completed.

## Feature Pages At A Glance

| Page | What It Is For |
|---|---|
| Dashboard | Quick overview of connection, local storage, active run, and recent runs |
| Sources | Create, discover, add, sync, archive, or reset sources |
| New Sync | Select a source, add files, validate them, and start upload |
| Active Run | Monitor the current sync while it is running |
| History | Review previous local sync runs |
| Settings | Manage app preferences and local storage options |
| Diagnostics | Check whether the app is ready to work with Genesys Cloud |

## Frequently Asked Questions

### Do I need SharePoint to use this app?

No. The app is specifically useful when you do not want to depend on SharePoint or another external knowledge system for a demo. You can upload files directly into a FileUpload source.

### Does the app replace Knowledge Fabric?

No. The app helps populate and manage FileUpload sources. Genesys Cloud Knowledge Fabric remains the system that stores and uses the knowledge source.

### Does the app have a central database?

No. The app does not keep a centralized database of user sources and history. User app data is stored locally on the device and protected by the vault passphrase.

### Why do I need a vault passphrase?

The vault passphrase protects the app data saved locally on your device, such as saved source references and sync history. It is separate from your Genesys Cloud password.

### What happens if I forget the vault passphrase?

The app cannot recover the local vault without the passphrase. You can reset local data and add your Genesys Cloud sources again. Resetting local app data does not remove sources from Genesys Cloud.

### Does reset delete my source content?

Reset is intended to clear a source for reuse. From the user’s perspective, it replaces the current source with a new empty one and updates the app to use that clean source. Use it only when clearing that source is expected.

### Can I use the same source for multiple demos?

Yes — and for **generic reusable demos**, that is the recommended approach. Create the source once, upload all the files, and reuse it across sessions without resetting.

Reset is for a different situation: when a **custom demo** is finished and the content should be cleared before loading a different scenario into the same source slot.

### Are there limits on how many sources I can create?

Yes. Genesys Cloud organizations can only hold a limited number of knowledge sources. This is why generic reusable demos should keep one long-lived source populated rather than creating and resetting sources repeatedly. Each reset replaces the old source with a new one, which still counts against the org limit.

### Is run history shared across users?

No. Run history is local to the browser/device because the app does not use a centralized database.

### Do users need a Genesys Cloud account?

Yes. Users sign in with their own Genesys Cloud account, and their available actions depend on their Genesys Cloud permissions.

## Summary

Genesys Knowledge Fabric File Sync Manager gives demo users and solution teams a simple way to prepare Knowledge Fabric FileUpload sources without relying on SharePoint, third-party knowledge systems, or custom integrations.

The happy path is intentionally straightforward:

1. Sign in with Genesys Cloud.
2. Unlock or create the local vault.
3. Go to **Sources**.
4. Create a new FileUpload source (or reuse an existing one).
5. Start a sync and drop files.
6. Use the source in the Genesys Cloud feature demonstration.
7. **Custom demo:** reset the source when finished.
8. **Generic reusable demo:** leave the source populated for next time.

That loop is the core value of the app: fast content setup, clear sync feedback, and flexible source management — reset when a custom demo is done, or keep a generic demo source ready for reuse while staying within Genesys Cloud source limits.

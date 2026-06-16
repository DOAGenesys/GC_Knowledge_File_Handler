# Genesys Knowledge Fabric File Sync Manager Feature Guide

## Overview

Genesys Knowledge Fabric File Sync Manager is a user-facing web app for quickly preparing **FileUpload** knowledge sources in Genesys Cloud.

Its main purpose is to make it easy to demonstrate, test, and refresh any Genesys Cloud experience that depends on Knowledge Fabric. Instead of setting up SharePoint, depending on another third-party knowledge system, or building a custom integration just to get sample content into Knowledge Fabric, users can do the essentials directly from this app:

- Create a new FileUpload source.
- Add real files from their device.
- Run a sync so those files become available in Genesys Cloud.
- Run a Full sync when a source needs a fresh file set, or keep the source populated when the demo is meant to be reused.

This makes the app especially useful for demos, workshops, proof-of-concepts, enablement sessions, and repeatable testing scenarios where the important goal is to show the Genesys feature that consumes knowledge, not spend time preparing a separate content system.

## What The App Is For

Use this app when you need a fast, controlled way to put documents into Genesys Cloud Knowledge Fabric.

Good examples include:

- Preparing a demo knowledge source for a customer meeting.
- Loading a small document set for a proof-of-concept.
- Testing how a Genesys Cloud feature behaves with different knowledge articles or files.
- Keeping a generic demo source populated for future reuse, without creating new sources each time.
- Replacing a custom demo source's files after a one-off session when the content is no longer needed.
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
- Run Full sync to replace a source's files after a custom demo, or keep it populated for a reusable generic demo.
- Archive a local source reference if they no longer want to see it in the app.

For demo work, the most important action is usually **Create source**.

### File Sync

The app lets users select files from their device and push them into a FileUpload source.

During a sync, users can:

- Choose the source they want to populate.
- Select or drag and drop files.
- Review file names and validation messages before starting.
- Add the original document URL for each file, so Genesys source links can open the document from Agent Copilot.
- Start the sync.
- Watch upload progress.
- See whether the run completed or needs attention.

The app is designed to be clear about outcomes. It should only show a successful completion when the selected files have successfully uploaded.

### Document URLs For Agent Copilot Source Links

Each uploaded file can include a **Document URL**. This is the stable HTTPS location of the original document, such as a SharePoint, Confluence, intranet, or public document URL.

Document URLs are important because Agent Copilot can show source links for answers. When a document URL is provided, clicking the source can open the original document. When the document URL is missing, Genesys does not have an original document location for that file, so the source link opens the default Genesys experience instead.

Use these rules:

- Use a real, stable `https://` URL for the original document.
- Do not use a local file path from your computer.
- Do not use a temporary upload URL.
- Leave the field empty only when there is no document location to open.
- Make sure users who click the source link have permission to access the document URL.

Examples:

| File | Good Document URL |
|---|---|
| `pricing-faq.pdf` | `https://company.sharepoint.com/sites/kb/pricing-faq.pdf` |
| `returns-policy.docx` | `https://company.example.com/knowledge/returns-policy.docx` |

### Incremental Sync And Full Sync

The app supports two sync modes. The choice matters because each mode changes the source in a different way.

| Sync mode | What it does | Use it when |
|---|---|---|
| **Incremental sync** | Adds new uploaded files and updates uploaded files that already exist in the source. Files that are already in the source and are not part of this upload stay in the source. | You want to add a few files, update an existing file, or keep building the same source over time. |
| **Full sync** | Replaces the source content with the files uploaded in this sync round. Files that are already in the source and are not part of this upload are removed when the sync completes. | You want the source to contain a clean, complete file set while keeping the same source ID. |

Think of the modes this way:

- **Incremental sync** means "add or update these files."
- **Full sync** means "make this source contain exactly these files."

Whether you should run a Full sync depends on the type of demo:

| Demo type | Typical approach | Why |
|---|---|---|
| **Custom demo** | Full sync with the next complete file set | The content was built for one audience or scenario and is unlikely to be reused. Full sync clears files that are not included in the new upload while keeping the same source ID. |
| **Generic reusable demo** | Use Incremental sync or leave it unchanged | The same file set is meant to be shown again and again. Leave the source populated so the next session can start immediately without re-uploading files or creating a source. |

From a user standpoint, Full sync means:

- The source ID stays the same.
- Existing source files not included in the upload are removed.
- The source contains the files uploaded in that Full sync round when processing completes.

**Source limits matter.** Genesys Cloud organizations can only hold a limited number of knowledge sources. Reusing one long-lived source and refreshing it with Full sync avoids consuming extra source slots.

Use Full sync carefully. Include every file that should remain in the source.

### How To Use Full Sync To Refresh Source Content

Use Full sync when a source already exists and you want to replace its content without creating a new source.

Steps:

1. Go to **New Sync**.
2. Choose the existing source you want to refresh.
3. Select **Full** as the sync type.
4. Select every file that should remain in the source after the sync.
5. Review the preflight checks.
6. Start the sync and confirm the Full sync warning.
7. Wait for the run to complete.

After the Full sync completes:

- The source keeps the same source ID.
- Linked Genesys features, such as Agent Copilot or AVAs, can continue using the same source.
- The source contains only the files uploaded in that Full sync round.
- Files that were previously in the source but were not uploaded in that Full sync round are removed.

Important examples:

- If a source has 50 files and you run Full sync with 50 files, the source has those 50 files after completion.
- If a source has 50 files and you run Full sync with 1 file, the source has only that 1 file after completion.
- If you only want to add 1 new file to the existing 50 files, use Incremental sync.

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
- Clearing local app data does not delete Genesys Cloud sources, but the user may need to add those sources back into the app.
- A different browser or device will have its own local vault.

This design keeps the app lightweight and portable while avoiding a central database for demo data.

## Happy Path: Create A Source, Upload Files, Then Decide Whether To Refresh Content

The most common workflow is:

1. Go to **Sources**.
2. Create a new FileUpload source (or select an existing reusable one).
3. Start a sync for that source.
4. Drop files into the sync screen.
5. Run the sync.
6. Use the populated source in the Genesys Cloud feature you want to demonstrate.
7. **Custom demo:** use Full sync with the next complete file set when the source needs fresh content.
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

Most demo flows use **Incremental** sync. Incremental sync adds the selected files to the source and leaves the other existing files in place.

If Full sync is enabled for the environment, users can choose **Full** sync to replace all existing source content with the files uploaded in that round. Full sync is the right choice when the source needs a clean content set while keeping the same source ID.

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

## Step 7: After The Demo — Refresh Or Keep The Source

What you do after the demo depends on whether it was a one-off custom session or a generic demo you plan to run again.

### Custom demo — replace files with Full sync

For a custom demo built for a specific customer, workshop, or scenario, use **Full** sync the next time this source needs a different content set.

Full sync makes sense when:

- The content was tailored to one audience and will not be reused.
- The next demo needs a completely different knowledge set in the same source slot.
- You want to clear customer-specific or scenario-specific files before the next session.

The app asks for confirmation before starting a Full sync. Follow the prompt carefully.

After Full sync completes, the source contains only the files included in that sync round.

### Generic reusable demo — keep the source populated

For a generic demo you run regularly — for example, a standard product walkthrough or an internal enablement session — keep the source populated.

Instead:

- Upload all the files the demo needs in one go (or add more over time with incremental syncs).
- Leave the source populated so the next session starts instantly.
- Reuse the same source across weeks or months without re-uploading.

This approach is especially important because Genesys Cloud organizations have a **limited number of knowledge sources**. A single long-lived generic demo source is more efficient than spinning up a new one for every session.

## Recommended Demo Workflows

### Custom demo workflow

Use this pattern for one-off, audience-specific demos:

1. Create a source named for the scenario (e.g. `Demo - Acme Corp FAQ`).
2. Upload only the files needed for that session.
3. Run the Genesys Cloud demonstration.
4. Use **Full sync** with the next complete file set when this source needs fresh content.

This keeps the org tidy and preserves the same source ID for linked Genesys assets.

### Generic reusable demo workflow

Use this pattern for demos you run again and again:

1. Create a source with a stable, generic name (e.g. `Demo - Product Knowledge`).
2. Upload the full file set the demo requires.
3. Run the Genesys Cloud demonstration.
4. **Leave the source populated** between sessions.
5. Reuse the same source in every future session without re-uploading.

This saves time, preserves source slots, and makes repeat demos predictable.

## Example Demo Scenarios

### Generic product documentation demo (reusable)

Create a source named `Demo - Product Docs`, upload product manuals or release notes, and demonstrate how the Genesys feature finds answers from that content. Reuse this source in every product demo session.

### Custom policy FAQ demo (one-off)

Create a source named `Demo - Acme Travel Policy`, upload HR or travel policy files tailored to a specific customer conversation, run the demo, then use Full sync with the next complete file set when the source needs different content.

### Industry-specific custom demo (one-off)

Create a source named for the audience, such as `Demo - Retail FAQ` or `Demo - Healthcare FAQ`, upload scenario-specific files, run the demo, and use Full sync when the source needs a new content set.

### Before-and-after demo (custom)

Run a demo with one set of files, then run Full sync with a different complete file set and show how the experience changes when Knowledge Fabric is fed different knowledge.

## Practical Tips For Users

- Use clear source names so they are easy to identify later.
- Keep demo file sets focused and small.
- Avoid uploading confidential, regulated, or customer-sensitive files unless the environment is approved for that content.
- For **generic reusable demos**, keep one long-lived source populated.
- For **custom one-off demos**, use Full sync with the next complete file set to clear scenario-specific content.
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

When this happens, review the run details in the app. Depending on the situation, the user may need to retry the sync, reselect files, verify the source in Genesys Cloud, or run a new Full sync with the complete intended file set.

The app is intentionally cautious. If it cannot confidently confirm success, it should not present the run as successfully completed.

## Feature Pages At A Glance

| Page | What It Is For |
|---|---|
| Dashboard | Quick overview of connection, local storage, active run, and recent runs |
| Sources | Create, discover, add, sync, or archive sources |
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

The app cannot recover the local vault without the passphrase. You can clear local app data and add your Genesys Cloud sources again. Clearing local app data does not remove sources from Genesys Cloud.

### Does Full sync delete my source content?

Yes. Full sync replaces the source content with the files uploaded in that round. Files already in the source that are not included in the Full sync upload are removed when the sync completes.

### Can I use the same source for multiple demos?

Yes — and for **generic reusable demos**, that is the recommended approach. Create the source once, upload all the files, and reuse it across sessions.

Full sync is for a different situation: when the content should be replaced before loading a different scenario into the same source slot.

### Are there limits on how many sources I can create?

Yes. Genesys Cloud organizations can only hold a limited number of knowledge sources. This is why generic reusable demos should keep one long-lived source populated instead of creating new sources repeatedly.

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
7. **Custom demo:** run Full sync with the next complete file set when the source needs fresh content.
8. **Generic reusable demo:** leave the source populated for next time.

That loop is the core value of the app: fast content setup, clear sync feedback, and flexible source management — replace content with Full sync for custom demos, or keep a generic demo source ready for reuse while staying within Genesys Cloud source limits.

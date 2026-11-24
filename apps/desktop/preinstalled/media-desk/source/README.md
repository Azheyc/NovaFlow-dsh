# NovaFlow Media Desk

English | [中文](README.zh.md)

Open Media Desk from the NovaFlow sidebar. The first visit opens Inspiration. The default storage location is `media-desk/files` in the client data directory. You can change or restore the folder in settings. Existing projects and assets still use their original locations. Keep external drives mounted to access those files.

## Infinite canvas

Right-click an empty area and choose a node type to create it at the pointer. When a text node connects to an image generator, its disabled prompt field shows the upstream text. Disconnect it to restore the local draft. Double-click an image or video to enlarge it. Press Esc, use the close button or click the backdrop to return to the canvas.

Select the separate Infinite canvas button to open the last-used canvas. If the list is empty, Media Desk creates an Untitled canvas. Use Add node to insert text, images, videos or generation nodes. Select a card to edit it. Click the canvas or press Esc to close the editor. Text nodes support Markdown. Drag between the output port on the right and the input port on the left in either direction. Images connected to video generation start as references. The next automatic connection remembers the last choice of First frame or Image references. The current generation mode, existing connections and model capabilities take precedence. Generation nodes use the model and group selected in NovaFlow settings. Submit from the node editor and use Check status to look up the original task.

Image generation offers 1K and 2K, with 2K as the default. Resolution follows the long edge. A 4K prompt request generates at 2K with the same aspect ratio. Video supports text, first-frame and image-reference modes as allowed by the selected model. The assistant uses a DSH session dedicated to this canvas. It can read available skills, edit nodes, connect reference images, generate media and check task status.

A new canvas chat offers six workflow prompts. Choose Write a story, Cinematic storyboard, Extract story assets, Character reference board or Additional scene angles to fill the draft with instructions for the corresponding global skill. Add your script, material or node names and send when ready. Build on the canvas uses canvas tools to prepare nodes and connections, then waits for confirmation before generating media. In an existing chat, use Workflow prompts in the assistant header to choose the next step.

The bottom toolbar starts in **Pan** mode. Left-drag the canvas background to pan, or switch to **Marquee select** to select cards. Middle-drag pans in either mode. Right-click to add a node at the pointer. Scroll to zoom around the pointer. After selecting cards, choose **Group selection**. Drag the frame to move its members together. Drop a card’s center inside or outside a frame to join or leave it, or select the frame and cards together and choose **Add to group**. Select the frame and choose **Ungroup** to keep its cards and connections in place.

Select any card or frame and drag its bottom-right corner to resize it. Resizing a frame preserves the size of its members. Press Ctrl or Cmd with C, V, Z, Shift+Z, F or G to copy, paste, undo, redo, find or group. Press Shift+Ctrl/Cmd+G to ungroup. The canvas supports a minimap, automatic layout and viewport restoration. Grid snapping is off by default and can be enabled in Canvas tools.

## File storage

Uploads go to `素材`, generations to `生成/图片` and `生成/视频`, exports to `成稿`, and canvas documents to `画布`. Existing inspiration items, settings, DSH sessions and attachments keep their storage. Deleting a canvas offers to clean up its exclusive files and keeps shared files.

## Local maintenance

This version derives from the MIT-licensed v2.7.2 source of `woniuniuniu/dsh-media-desk`. It retains Inspiration, Content, Schedule, Review and Style. The original author is 蜗牛的科技笔记. See [upstream v2.7.2](https://github.com/woniuniuniu/dsh-media-desk/tree/v2.7.2) and [LICENSE](LICENSE).

From the desktop repository, run `node --test 'apps/desktop/preinstalled/media-desk/source/test/*.test.js'` to check the plugin. Preparing the desktop seed compiles the browser entry and copies the Host source. NovaFlow desktop updates replace the bundled plugin. Project data is stored separately.

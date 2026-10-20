//! Touchpad pinch zooms the document, as in Word, instead of the whole window.
//!
//! WebKitGTK handles a pinch itself and scales the entire page; the page never sees it. A zoom gesture of our
//! own on the webview, in the capture phase, claims the pinch first and sends each step to the frontend as a
//! `document-pinch` event carrying the scale change since the previous step. Other platforms' webviews deliver
//! a pinch to the page as Ctrl+wheel, which the frontend already turns into document zoom.

#[cfg(target_os = "linux")]
pub fn route_to_document(window: &tauri::WebviewWindow) {
    use gtk::prelude::*;
    use std::cell::Cell;
    use std::rc::Rc;
    use tauri::Emitter;

    let target = window.clone();
    let _ = window.with_webview(move |webview| {
        let view = webview.inner();
        let gesture = gtk::GestureZoom::new(&view);
        gesture.set_propagation_phase(gtk::PropagationPhase::Capture);
        let previous = Rc::new(Cell::new(1.0_f64));
        {
            let previous = previous.clone();
            gesture.connect_begin(move |gesture, _| {
                previous.set(1.0);
                // Claiming the sequence denies it to WebKit's own zoom gesture.
                gesture.set_state(gtk::EventSequenceState::Claimed);
            });
        }
        gesture.connect_scale_changed(move |_, scale| {
            if scale <= 0.0 {
                return;
            }
            let step = scale / previous.get();
            previous.set(scale);
            // To this window only; with several open, each zooms its own document.
            let _ = target.emit_to(
                tauri::EventTarget::webview_window(target.label()),
                "document-pinch",
                step,
            );
        });
        // A GTK 3 gesture lives only as long as its owner holds it; the webview lives for the whole app.
        unsafe {
            view.set_data("inkspire-document-pinch", gesture);
        }
    });
}

#[cfg(not(target_os = "linux"))]
pub fn route_to_document(_window: &tauri::WebviewWindow) {}

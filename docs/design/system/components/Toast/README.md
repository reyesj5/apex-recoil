# Toast

A toast confirms what just happened and offers the way back: saved, failed, undo.

- `raised` with an `outline-strong` line, `radius-card-lg` corners, 12 px by 14 px padding, `shadow-toast`.
- Success: a 22 px `volt-wash-strong` disc with a `volt` check (14 px, 3 px stroke), the event in bold `text`, the detail in `text-secondary`: **Spec saved** R-99, version 15.
- Error: the same frame with `danger` in place of `volt`: a 22 px `danger-wash` disc with a `danger` x (14 px, 3 px stroke), the failure in bold `text` and its reason in `text-secondary`: **The spec was not saved** The server did not answer; your changes are still here.
- One action at the end, a text button in `volt`: `Undo`.
- Toasts stack at the bottom of the screen, last one on top; hovering or focusing one keeps it open.

Provide: the event, a detail that names the object or the reason, and an optional action. Announce a success politely (`role="status"`) and an error at once (`role="alert"`).

In the app: Sonner, through shadcn/ui's Sonner component.

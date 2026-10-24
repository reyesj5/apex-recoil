# Toast

A toast confirms what just happened and offers the way back: saved, failed, undo.

- `raised` with an `outline-strong` line, `radius-card-lg` corners, 12 px by 14 px padding, `shadow-toast`.
- Success: a 22 px `volt-wash-strong` disc with a `volt` check (14 px, 3 px stroke), the event in bold `text`, the detail in `text-secondary`: **Spec saved** R-99, version 15.
- One action at the end, a text button in `volt`: `Undo`.
- Toasts stack at the bottom of the screen, last one on top; hovering or focusing one keeps it open.

The error toast is not designed yet; build it from the same frame with `danger` in place of `volt` and the reason in the detail.

Provide: the event, a detail that names the object, and an optional action. Announce it politely (`role="status"`).

In the app: Sonner, through shadcn/ui's Sonner component.

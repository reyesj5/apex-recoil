# AlertDialog

An alert dialog asks before something that can't be taken back, such as deleting a sample.

- The Dialog frame (`sd-dialog`, 448 px) without a close button: the answer is one of its two buttons, or Escape for the safe one.
- The title asks the question: "Delete this sample?" The description says exactly what goes: "Spray 3 and its wall screenshot are removed from the session."
- Two buttons on the right: the safe answer first as a secondary button, naming what it keeps (`Keep sample`), then the action as a destructive button, naming what it does (`Delete sample`). Never `OK` and `Cancel`.
- Focus starts on the safe answer.

Provide: the question, what goes, and the two labels. Use `role="alertdialog"` with the title and description wired as for Dialog.

In the app: shadcn/ui Alert Dialog; its Cancel is a secondary button and its Action takes the destructive variant.

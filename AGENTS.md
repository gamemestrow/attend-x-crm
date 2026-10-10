<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Attendance is written only by server functions in src/lib/attendance/attendance.functions.ts (two-step: begin at QR scan, submit with location); browsers have no insert rights — so client-side distance/approval can't be forged.
- Location verification uses browser geolocation only; quality threshold (LOCATION_QUALITY) is kept separate from the teacher's radius and never widens it.

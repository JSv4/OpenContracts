- Fixed the Extract PDF end-to-end test stalling behind badge celebrations by
  labeling the celebration as a dialog and dismissing it through its Close
  button. The Extract CI job now retains HTML reports and failure artifacts,
  runs one complete attempt, and reserves time for diagnostics before timeout.

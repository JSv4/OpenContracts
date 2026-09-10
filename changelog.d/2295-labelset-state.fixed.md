- Fixed label-set workflows (#2295): `LabelSetDetailPage` normalizes label colors
  for the API, preserves failed create forms, and waits for refreshed labels before
  reporting success. Populated label lists keep **Add Label** beside search, including
  when no results match. `LabelSetSelector` returns the selected object so
  `CorpusModal` immediately displays the chosen label set and clears it correctly.

OpenContracts is built in part on top of the [PAWLs](https://github.com/allenai/pawls) project frontend. We have made
extensive changes, however, and plan to remove even more of the original PAWLs codebase, particularly their state management,
as it's currently duplucitive of the Apollo state store we use throughout the application. That said, PAWLs was the
inspiration for how we handle text extraction, and we're planning to continue using their PDF rendering code. We are also
using PAWLs' pre-processing script, which is based on Grobid.

We should also thank the [Grobid](https://grobid.readthedocs.io/en/latest/) project, which was clearly a source of
inspiration for PAWLs and an extremely impressive tool. Grobid is designed more for medical and scientific papers, but,
nevertheless, offers a tremendous amount of inspiration and examples for the legal world to borrow. Perhaps there is an
opportunity to have a unified tool in that respect.

Finally, let's not forget [Tesseract](https://github.com/tesseract-ocr/tesseract), the OCR engine that started its life
as an HP research project in the 1980s before being taken over by Google in the early aughts and finally becoming an
independent project in 2018. Were it not for the excellent, free OCR provided by Tesseract, we'd have to rely on
commercial OCR tech, which would make this kind of opensource, free project prohibitively expensive. Thanks to the many,
many people who've made free OCR possible over the nearly 40 years Tesseract has been under development.

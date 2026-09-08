# Speech fixture

`speech.wav` is a locally synthesized test recording made with the Windows Microsoft Zira Desktop voice. It contains no microphone capture or student data.

Text: “Let us explore one idea.” [pause] “What changes when the whole gets bigger?”

The browser fixture routes this recording through a MediaStream and Web Audio analyser. Tests observe actual avatar geometry during speech and sustained silence. No external service or audio device permission is needed, and test audio is not routed to the speakers.

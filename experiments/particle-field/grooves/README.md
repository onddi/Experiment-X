# Live drums data

`data.json` holds grooves played by real drummers, taken from the
[Groove MIDI Dataset](https://magenta.tensorflow.org/datasets/groove) by Google,
licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Jon Gillick, Adam Roberts, Jesse Engel, Douglas Eck and David Bamman.
"Learning to Groove with Inverse Sequence Transformations." ICML 2019.

The MIDI was trimmed to the first bars of each take and re-encoded
(`convert.py`); timing and velocities are as played.

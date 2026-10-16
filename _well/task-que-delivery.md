---
type: task
description: "Define how que is delivered to a deployment, ideally as an image that a deployment folder is placed on top of. Reference when picking this up: what is wanted, how que is delivered today, what is known, and what is open."
status: planned
belongs_to: "[[que]]"
---
A better way to deliver que to a deployment, ideally as an image.
- [[#What is wanted]] the outcome
- [[#Where it stands]] how que is delivered today
- [[#What is known]] what does not change, and what must be there first
- [[#Open]] what has to be decided before a spec
- [[#Done means]] how to tell it is finished

- [[que]]: the harness this belongs to
- [[shit_sdlc]]: Ship, which moves a change as an image to a node
- [[task-packages-from-git]]: how a deployment gets its packages

---
## What is wanted

- que is one thing a deployment takes and runs, at a known version
- ideally an image: que is built into one, and a deployment is that image with its own folder on top
- a deployment runs on a machine that has no checkout of que
- the same delivery serves a deployment on a server and one on a laptop

## Where it stands

- que runs from its own repo folder, in the dev container, with the dev server
- nothing builds que: there is no image and no build step. The pipeline runs checks only
- a deployment is a folder outside que's repo. Its `start` script runs que from a checkout of que on the same machine
- nothing in que's own folder picks a deployment

## What is known

- delivery does not change how que and a deployment fit together. que starts, pointed at a deployment folder; an image is the box both folders are shipped in
- so the code is the same with or without an image
- que loads a package from a folder outside its own, and hands it the contract. So a deployment needs no copy of que's code, only a que to run on
- making que fit for production (a real login, a server that is not the dev server) is a separate piece of work. An image can hold que as it runs today

## Open

- how a deployment gets on top of the image: copied in when its own image is built, or mounted when it runs
- where the image is built and kept
- one image for the harness and the web UI, or two
- how a version of que is named, and how a deployment says which one it uses
- how a person runs it on a laptop: the image with the folder mounted, or que as a folder on disk

## Done means

- a deployment folder and one command give a running que for that deployment
- it works on a machine with no checkout of que
- two deployments run from the same version of que, each with its own packages

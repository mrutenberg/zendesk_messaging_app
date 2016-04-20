![](https://samson.zende.sk/projects/notification_app/stages/staging.svg?token=84457be797bb7a1e00d1f57575d5112a)

# Notification App

This is an agent notification app.

It has two goals:

1. demonstrating a possible usage of the `notify` endpoint of ZAM,
2. broadcasting messages to signed-in agents.

Only administrators can broadcast messages. They can send them to everybody, or
just target a few groups.

The messages can use a restricted subset of Markdown:

* links
* images
* bold
* italic
* level 3 header

Also, URLs are detected and automatically turned either into a link or an image.


#### Contributing

Reviews and pull requests are more than welcome!

## Deployment
This app is deployed using [ZAT](https://github.com/zendesk/zendesk_apps_tools) via [Samson](https://github.com/zendesk/samson) on staging ([link for Zendesk deployers](https://samson.zende.sk/projects/notification_app/stages/staging)).

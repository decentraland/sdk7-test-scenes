Clickable cube that changes color according to the signed fetch request state:
🔵 Blue	Ready to click
🟡 Yellow	Request in progress
🟢 Green	Success
🔴 Red	Error

When clicked, it makes a signedFetch GET request to https://httpbin.org/get, which echoes back the request headers so you can see the signed authentication headers that Decentraland adds automatically.

The console will log:
- Response status
- Full response body (including all headers sent)
- Any errors if the request fails
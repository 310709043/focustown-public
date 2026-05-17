{
  "containerName": "caddy",
  "containerPort": 80,
  "healthCheck": {
    "healthyThreshold": 2,
    "unhealthyThreshold": 3,
    "timeoutSeconds": 5,
    "intervalSeconds": 10,
    "path": "/healthz",
    "successCodes": "200"
  }
}

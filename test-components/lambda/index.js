const handler = (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      hello: `world from method: "${event.httpMethod}"`
    })
  }
}

module.exports = {
  handler
}

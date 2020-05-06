const handler = (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      hello: `from "${event.path}"`
    })
  }
}

module.exports = {
  handler
}

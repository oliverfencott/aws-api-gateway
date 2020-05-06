const handler = () => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      hello: 'world!'
    })
  }
}

module.exports = {
  handler
}

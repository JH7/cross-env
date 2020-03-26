const {exec} = require('child_process')

module.exports = getSubstitutionVar

function getSubstitutionVar(varName) {
  return new Promise((resolve, reject) => {
    const command = varName.match(/\$\((.*)\)/)[1]

    exec(command, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }

      resolve(stdout)
    })
  })
}

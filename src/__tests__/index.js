const crossSpawnMock = require('cross-spawn')
const isWindowsMock = require('../is-windows')

jest.mock('../is-windows')
jest.mock('cross-spawn')

const crossEnv = require('../')

const getSpawned = (call = 0) => crossSpawnMock.spawn.mock.results[call].value

process.setMaxListeners(20)

beforeEach(() => {
  jest.spyOn(process, 'exit').mockImplementation(() => {})
  crossSpawnMock.spawn.mockReturnValue({on: jest.fn(), kill: jest.fn()})
})

afterEach(() => {
  jest.clearAllMocks()
  process.exit.mockRestore()
})

test(`sets environment variables and run the remaining command`, () => {
  testEnvSetting({FOO_ENV: 'production'}, 'FOO_ENV=production')
})

test(`APPDATA is undefined and not string`, () => {
  testEnvSetting({FOO_ENV: 'production', APPDATA: 2}, 'FOO_ENV=production')
})

test(`handles multiple env variables`, () => {
  testEnvSetting(
    {
      FOO_ENV: 'production',
      BAR_ENV: 'dev',
      APPDATA: '0',
    },
    'FOO_ENV=production',
    'BAR_ENV=dev',
    'APPDATA=0',
  )
})

test(`handles special characters`, () => {
  testEnvSetting({FOO_ENV: './!?'}, 'FOO_ENV=./!?')
})

test(`handles single-quoted strings`, () => {
  testEnvSetting({FOO_ENV: 'bar env'}, "FOO_ENV='bar env'")
})

test(`handles double-quoted strings`, () => {
  testEnvSetting({FOO_ENV: 'bar env'}, 'FOO_ENV="bar env"')
})

test(`handles equality signs in quoted strings`, () => {
  testEnvSetting({FOO_ENV: 'foo=bar'}, 'FOO_ENV="foo=bar"')
})

test(`handles empty single-quoted strings`, () => {
  testEnvSetting({FOO_ENV: ''}, "FOO_ENV=''")
})

test(`handles empty double-quoted strings`, () => {
  testEnvSetting({FOO_ENV: ''}, 'FOO_ENV=""')
})

test(`handles no value after the equals sign`, () => {
  testEnvSetting({FOO_ENV: ''}, 'FOO_ENV=')
})

test(`handles quoted scripts`, async () => {
  await crossEnv(['GREETING=Hi', 'NAME=Joe', 'echo $GREETING && echo $NAME'], {
    shell: true,
  })
  expect(crossSpawnMock.spawn).toHaveBeenCalledWith(
    'echo $GREETING && echo $NAME',
    [],
    {
      stdio: 'inherit',
      shell: true,
      env: {...process.env, GREETING: 'Hi', NAME: 'Joe'},
    },
  )
})

test(`handles escaped characters`, async () => {
  // this escapes \,",' and $
  await crossEnv(
    ['GREETING=Hi', 'NAME=Joe', 'echo \\"\\\'\\$GREETING\\\'\\" && echo $NAME'],
    {
      shell: true,
    },
  )
  expect(crossSpawnMock.spawn).toHaveBeenCalledWith(
    'echo "\'$GREETING\'" && echo $NAME',
    [],
    {
      stdio: 'inherit',
      shell: true,
      env: {...process.env, GREETING: 'Hi', NAME: 'Joe'},
    },
  )
})

test(`does nothing when given no command`, async () => {
  await crossEnv([])
  expect(crossSpawnMock.spawn).toHaveBeenCalledTimes(0)
})

test(`normalizes commands on windows`, async () => {
  isWindowsMock.mockReturnValue(true)
  await crossEnv(['./cmd.bat'])
  expect(crossSpawnMock.spawn).toHaveBeenCalledWith('cmd.bat', [], {
    stdio: 'inherit',
    env: {...process.env},
  })
})

test(`does not normalize command arguments on windows`, async () => {
  isWindowsMock.mockReturnValue(true)
  await crossEnv(['echo', 'http://example.com'])
  expect(crossSpawnMock.spawn).toHaveBeenCalledWith(
    'echo',
    ['http://example.com'],
    {
      stdio: 'inherit',
      env: {...process.env},
    },
  )
})

test(`propagates kill signals`, async () => {
  await testEnvSetting({FOO_ENV: 'foo=bar'}, 'FOO_ENV="foo=bar"')

  process.emit('SIGTERM')
  process.emit('SIGINT')
  process.emit('SIGHUP')
  process.emit('SIGBREAK')
  const spawned = getSpawned()
  expect(spawned.kill).toHaveBeenCalledWith('SIGTERM')
  expect(spawned.kill).toHaveBeenCalledWith('SIGINT')
  expect(spawned.kill).toHaveBeenCalledWith('SIGHUP')
  expect(spawned.kill).toHaveBeenCalledWith('SIGBREAK')
})

test(`keeps backslashes`, async () => {
  isWindowsMock.mockReturnValue(true)
  await crossEnv(['echo', '\\\\\\\\someshare\\\\somefolder'])
  expect(crossSpawnMock.spawn).toHaveBeenCalledWith(
    'echo',
    ['\\\\someshare\\somefolder'],
    {
      stdio: 'inherit',
      env: {...process.env},
    },
  )
})

test(`propagates unhandled exit signal`, async () => {
  const {spawned} = await testEnvSetting(
    {FOO_ENV: 'foo=bar'},
    'FOO_ENV="foo=bar"',
  )
  const spawnExitCallback = spawned.on.mock.calls[0][1]
  const spawnExitCode = null
  spawnExitCallback(spawnExitCode)
  expect(process.exit).toHaveBeenCalledWith(1)
})

test(`exits cleanly with SIGINT with a null exit code`, async () => {
  const {spawned} = await testEnvSetting(
    {FOO_ENV: 'foo=bar'},
    'FOO_ENV="foo=bar"',
  )
  const spawnExitCallback = spawned.on.mock.calls[0][1]
  const spawnExitCode = null
  const spawnExitSignal = 'SIGINT'
  spawnExitCallback(spawnExitCode, spawnExitSignal)
  expect(process.exit).toHaveBeenCalledWith(0)
})

test(`propagates regular exit code`, async () => {
  const {spawned} = await testEnvSetting(
    {FOO_ENV: 'foo=bar'},
    'FOO_ENV="foo=bar"',
  )
  const spawnExitCallback = spawned.on.mock.calls[0][1]
  const spawnExitCode = 0
  spawnExitCallback(spawnExitCode)
  expect(process.exit).toHaveBeenCalledWith(0)
})

async function testEnvSetting(expected, ...envSettings) {
  if (expected.APPDATA === 2) {
    // kill the APPDATA to test both is undefined
    const {env} = process
    delete env.APPDATA
    delete expected.APPDATA
  } else if (!process.env.APPDATA && expected.APPDATA === '0') {
    // set APPDATA and test it
    process.env.APPDATA = '0'
  }
  const ret = await crossEnv([...envSettings, 'echo', 'hello world'])
  const env = {}
  if (process.env.APPDATA) {
    env.APPDATA = process.env.APPDATA
  }
  Object.assign(env, expected)
  const spawned = getSpawned()
  expect(ret).toBe(spawned)
  expect(crossSpawnMock.spawn).toHaveBeenCalledTimes(1)
  expect(crossSpawnMock.spawn).toHaveBeenCalledWith('echo', ['hello world'], {
    stdio: 'inherit',
    shell: undefined,
    env: {...process.env, ...env},
  })

  expect(spawned.on).toHaveBeenCalledTimes(1)
  expect(spawned.on).toHaveBeenCalledWith('exit', expect.any(Function))
  return {spawned}
}

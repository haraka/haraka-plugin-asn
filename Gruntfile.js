
module.exports = function (grunt) {

  grunt.loadNpmTasks('grunt-eslint');

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    eslint: {
      main: {
        src: ['Gruntfile.js','index.js','lib/**/*.js']
      },
      test: {
        src: ['test/**/*.js'],
      }
    },
  });

  grunt.registerTask('lint',    ['eslint']);
  grunt.registerTask('default', ['eslint']);
};

<?php

namespace Drupal\ict_busroutes\Plugin\Block;

use Drupal\Core\Block\BlockBase;
use Drupal\Core\Render\Markup;

/**
 * Provides a Bus Routes App block.
 *
 * @Block(
 *   id = "bus_routes_app_block",
 *   admin_label = @Translation("Bus Routes Version 2 Static App"),
 *   category = @Translation("Custom")
 * )
 */
class BusRoutesAppBlock extends BlockBase {

  /**
   * {@inheritdoc}
   */
  public function build() {
    return [
      '#markup' => $this->getApplication(),
      '#attached' => [
        'library' => [
          // 'ict_busroutes/busroutes_static_app',
        ],
      ],
    ];
  }

  /**
   * Get the application HTML content.
   *
   * @return string
   *   The HTML content for the application.
   */
  private function getApplication() {
    $module_path = \Drupal::service('extension.list.module')->getPath('ict_busroutes');
    $file_path = DRUPAL_ROOT . '/' . $module_path . '/app/stop_times.include.html';
    $file_contents = file_get_contents($file_path);
    $parsed_contents = str_replace('[[random_int]]', time(), $file_contents);

    if (file_exists($file_path)) {
      return Markup::create($parsed_contents);
    }

    return '<div>' . $this->t('Unable to load bus routes information.') . '</div>';
  }

  /**
   * {@inheritdoc}
   */
  public function getCacheMaxAge() {
    return 0;
  }

}
